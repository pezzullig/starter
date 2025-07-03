// Video Analyzer Script with OpenAI Vision API
// Reads from video mapping, analyzes each video, stores descriptions with Cloudinary links
// Run with: deno run --allow-net --allow-read --allow-write --allow-env scripts/video-analyzer.ts

// @ts-ignore
declare const Deno: any;

import { loadEnvConfig, type Config } from './env-loader.ts';

interface VideoAnalysis {
  description: string;
  shortFilename: string; // Short filename for audio files (less than 40 characters)
  confidence?: number;
  tags?: string[];
  duration?: number;
  objects?: string[];
  actions?: string[];
  rawResponses?: string[];
}

interface VideoMapping {
  cloudinaryUrl: string;
  publicId: string;
  localFile: string;
}

interface VideoMappingData {
  videos: VideoMapping[];
  totalVideos: number;
  generatedAt: string;
}

interface VideoAnalysisResult {
  cloudinaryUrl: string;
  publicId: string;
  localFile: string;
  analysis: VideoAnalysis;
  timestamp: string;
}

interface VideoAnalysisCollection {
  videos: VideoAnalysisResult[];
  totalVideos: number;
  processedAt: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Global config variable
let config: Config;

// Create JSON directory
async function ensureJsonDirectory(): Promise<void> {
  try {
    await Deno.mkdir('./json', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Load video mapping from JSON file
async function loadVideoMapping(): Promise<VideoMapping[]> {
  try {
    console.log(`📖 Loading video mapping from json/video-mapping.json...`);
    
    const mappingContent = await Deno.readTextFile('./json/video-mapping.json');
    const mappingData: VideoMappingData = JSON.parse(mappingContent);
    
    console.log(`✅ Loaded ${mappingData.videos.length} video mappings`);
    return mappingData.videos;
    
  } catch (error) {
    console.error(`❌ Error loading video mapping:`, error.message);
    console.log(`💡 Run 'deno task map-videos' first to create the video mapping`);
    throw error;
  }
}

// Check if video has already been analyzed
async function isVideoAlreadyAnalyzed(publicId: string): Promise<boolean> {
  try {
    const safePublicId = publicId.replace(/[^a-zA-Z0-9]/g, '_');
    const analysisFile = `./json/analysis-${safePublicId}.json`;
    await Deno.stat(analysisFile);
    return true;
  } catch (error) {
    return false;
  }
}

// Load existing analysis collection
async function loadExistingAnalysisCollection(): Promise<VideoAnalysisResult[]> {
  try {
    const collectionFile = './json/video-analysis-collection.json';
    const collectionContent = await Deno.readTextFile(collectionFile);
    const collectionData: VideoAnalysisCollection = JSON.parse(collectionContent);
    return collectionData.videos;
  } catch (error) {
    // Collection doesn't exist yet, return empty array
    return [];
  }
}

// Utility function for API calls with error handling
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    console.log(`🌐 Fetching: ${url}`);
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Success: ${url}`);
    return data;
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    throw error;
  }
}

// Extract frames from video using ffmpeg
async function extractVideoFrames(videoPath: string, frameCount: number = 3): Promise<string[]> {
  try {
    console.log(`🎞️  Extracting ${frameCount} frames from video...`);
    
    // Create frames directory if it doesn't exist
    const framesDir = './frames';
    try {
      await Deno.mkdir(framesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Use ffmpeg to extract frames
    const framePaths: string[] = [];
    
    for (let i = 0; i < frameCount; i++) {
      const frameNumber = i + 1;
      const framePath = `${framesDir}/frame_${frameNumber}.jpg`;
      
      // Calculate timestamp for frame extraction (distribute frames evenly)
      const duration = 10; // Assume 10 seconds for now
      const timestamp = (duration / frameCount) * i;
      
      const command = new Deno.Command('ffmpeg', {
        args: [
          '-i', videoPath,
          '-ss', timestamp.toString(),
          '-vframes', '1',
          '-q:v', '10', // Higher quality number = lower quality, max 31 (reduced from 5)
          '-vf', 'scale=640:480', // Scale down to reduce memory usage
          '-y', // Overwrite output files
          framePath
        ],
        stdout: 'piped',
        stderr: 'piped'
      });
      
      console.log(`   Extracting frame ${frameNumber} at ${timestamp}s...`);
      
      const { success, stderr } = await command.output();
      
      if (success) {
        framePaths.push(framePath);
        console.log(`   ✅ Frame ${frameNumber} extracted: ${framePath}`);
      } else {
        const errorText = new TextDecoder().decode(stderr);
        console.error(`   ❌ Failed to extract frame ${frameNumber}:`, errorText);
      }
    }
    
    console.log(`🎞️  Successfully extracted ${framePaths.length} frames`);
    return framePaths;
    
  } catch (error) {
    console.error(`❌ Error extracting frames from ${videoPath}:`, error.message);
    throw error;
  }
}

// Analyze video using OpenAI Vision API with actual frames
async function analyzeVideoWithOpenAI(videoPath: string): Promise<VideoAnalysis> {
  try {
    console.log(`🎬 Analyzing video with OpenAI Vision: ${videoPath}`);
    
    // Get OpenAI API key from config
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env. Please add your OpenAI API key.');
    }
    
    // Extract frames from video
    const frames = await extractVideoFrames(videoPath, config.MAX_FRAME_COUNT);
    
    if (frames.length === 0) {
      throw new Error('No frames could be extracted from the video. Please ensure ffmpeg is installed.');
    }
    
    console.log(`🔍 Analyzing ${frames.length} frames with OpenAI Vision...`);
    
    // Try multi-frame analysis first, fallback to single frame if memory issues
    try {
      console.log(`📤 Attempting multi-frame analysis (all frames in one call)...`);
      const analysis = await analyzeFramesWithOpenAI(frames, config.OPENAI_API_KEY);
      return analysis;
    } catch (error) {
      if (error.message.includes('memory') || error.message.includes('out of memory') || error.message.includes('413') || error.message.includes('Payload Too Large')) {
        console.log(`⚠️  Multi-frame analysis failed due to memory/payload size. Falling back to single frame analysis...`);
        return await analyzeFramesIndividually(frames, config.OPENAI_API_KEY);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error(`❌ Error analyzing video ${videoPath}:`, error.message);
    throw error;
  }
}

// Analyze multiple frames with OpenAI Vision in a single API call
async function analyzeFramesWithOpenAI(framePaths: string[], apiKey: string): Promise<VideoAnalysis> {
  try {
    console.log(`📤 Sending ${framePaths.length} frames to OpenAI Vision API for single video analysis...`);
    
    // Read all frames as base64 with memory management
    const imageContents: Array<{
      type: 'image_url';
      image_url: { url: string };
    }> = [];
    
    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      console.log(`   📸 Reading frame ${i + 1}/${framePaths.length}: ${framePath}`);
      
      const frameData = await Deno.readFile(framePath);
      const base64Frame = btoa(String.fromCharCode(...frameData));
      
      // Check if base64 string is too large (OpenAI has limits)
      if (base64Frame.length > 20000000) { // ~20MB limit
        throw new Error(`Frame ${i + 1} is too large (${(base64Frame.length / 1024 / 1024).toFixed(2)}MB). Consider reducing frame quality.`);
      }
      
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Frame}`
        }
      });
      
      // Clear frame data from memory immediately (let garbage collector handle it)
      // Note: frameData is a Uint8Array, we can't clear it directly
    }
    
    // Strict system message for JSON output
    const systemMessage = {
      role: 'system',
      content: 'You are a helpful assistant. You must always respond ONLY with a valid JSON object and nothing else. Do not include markdown, explanations, or any extra text.'
    };
    
    // Create the content array with strict JSON prompt and all images
    const content: Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }> = [
      {
        type: 'text',
        text: `Analyze these ${framePaths.length} video frames and provide a comprehensive, detailed description of the entire video content. Your analysis should be thorough and engaging.

DESCRIPTION REQUIREMENTS:
- Main subject and their actions (be specific about what they're doing)
- Setting and environment (location, time of day, weather if visible)
- Notable details and interesting elements
- Most prominent colors and their significance
- Important objects and their role in the scene
- Any emotions, expressions, or body language visible
- Movement and dynamics of the scene
- Any text, signs, or written elements
- Lighting and atmosphere
- Any unique or memorable aspects

IMPORTANT: Do NOT use filler phrases, generic commentary, or subjective language (such as 'adding a pop of color to the scene', 'making it a memorable and engaging watch', or 'capturing the suddenness and intensity of the moment'). Only describe what is visually present and factual. Focus on concrete, specific, and observable details from the video.

Make the description vivid and engaging, as if you're describing it to someone who can't see the video. Be specific about details that make this video unique and interesting.

SHORT FILENAME REQUIREMENTS:
- Create a descriptive filename (less than 40 characters)
- Use only lowercase letters, numbers, and underscores
- Make it memorable and specific to this video's content
- Examples: mtb_forest_crash, gorilla_eating_banana, cat_plays_piano, switzerland_nature

Respond ONLY with a valid JSON object in this exact format:
{
  "description": "Your detailed, comprehensive description here...",
  "shortFilename": "descriptive_filename"
}`
      },
      ...imageContents
    ];
    
    const response = await fetchApi<OpenAIResponse>('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          systemMessage,
          {
            role: 'user',
            content: content
          }
        ],
        max_tokens: 800,
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });
    
    // Clear image contents from memory
    imageContents.length = 0;
    
    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: { description: string; shortFilename: string } = { description: '', shortFilename: '' };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fallback: try to extract JSON from text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e2) {
          parsed = { description: raw, shortFilename: '' };
        }
      } else {
        parsed = { description: raw, shortFilename: '' };
      }
    }
    
    // Fallback for shortFilename
    if (!parsed.shortFilename) {
      // Generate a simple short filename from the first few words
      const words = parsed.description.split(' ').slice(0, 3);
      parsed.shortFilename = words
        .map(word => word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
        .filter(word => word.length > 0)
        .join('_')
        .substring(0, 30);
    }
    
    console.log(`🤖 OpenAI Response for video analysis:`);
    console.log(`   Description: ${parsed.description.substring(0, 100)}...`);
    console.log(`   Short filename: ${parsed.shortFilename}`);
    if (response.usage) {
      console.log(`   Tokens used: ${response.usage.total_tokens}`);
    }
    
    return {
      description: parsed.description,
      shortFilename: parsed.shortFilename
    };
    
  } catch (error) {
    console.error(`❌ Error analyzing frames:`, error.message);
    throw error;
  }
}

// Analyze frames individually as fallback for memory issues
async function analyzeFramesIndividually(framePaths: string[], apiKey: string): Promise<VideoAnalysis> {
  try {
    console.log(`📤 Analyzing ${framePaths.length} frames individually due to memory constraints...`);
    
    const descriptions: string[] = [];
    
    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      console.log(`   📸 Analyzing frame ${i + 1}/${framePaths.length}: ${framePath}`);
      
      // Read single frame as base64
      const frameData = await Deno.readFile(framePath);
      const base64Frame = btoa(String.fromCharCode(...frameData));
      
      // Clear frame data from memory immediately (let garbage collector handle it)
      // Note: frameData is a Uint8Array, we can't clear it directly
      
      const systemMessage = {
        role: 'system',
        content: 'You are a helpful assistant. You must always respond ONLY with a valid JSON object and nothing else. Do not include markdown, explanations, or any extra text.'
      };
      
      const content = [
        {
          type: 'text',
          text: `Analyze this single video frame and provide a detailed description of what you see. Focus on the main subject, actions, setting, and important details.

Respond ONLY with a valid JSON object in this exact format:
{
  "description": "Your detailed description of this frame..."
}`
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Frame}`
          }
        }
      ];
      
      const response = await fetchApi<OpenAIResponse>('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            systemMessage,
            {
              role: 'user',
              content: content
            }
          ],
          max_tokens: 400,
          temperature: 0.3,
          response_format: { type: "json_object" }
        })
      });
      
      const raw = response.choices[0]?.message?.content || '{}';
      let parsed: { description: string } = { description: '' };
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        parsed = { description: raw };
      }
      
      descriptions.push(parsed.description);
      
      // Clear base64 string from memory (let garbage collector handle it)
      
      // Small delay between requests to avoid rate limiting
      if (i < framePaths.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Combine all descriptions into a comprehensive analysis
    const combinedDescription = descriptions.join(' ');
    
    // Generate short filename from the combined description
    const words = combinedDescription.split(' ').slice(0, 3);
    const shortFilename = words
      .map(word => word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
      .filter(word => word.length > 0)
      .join('_')
      .substring(0, 30);
    
    console.log(`🤖 Combined analysis from ${framePaths.length} individual frames:`);
    console.log(`   Description: ${combinedDescription.substring(0, 100)}...`);
    console.log(`   Short filename: ${shortFilename}`);
    
    return {
      description: combinedDescription,
      shortFilename: shortFilename
    };
    
  } catch (error) {
    console.error(`❌ Error analyzing frames individually:`, error.message);
    throw error;
  }
}

// Main function to process videos from mapping
async function processVideosFromMapping() {
  console.log('🚀 Starting video analysis with OpenAI Vision...\n');
  
  try {
    // Ensure JSON directory exists
    await ensureJsonDirectory();
    
    // Check if we should analyze just one video (second video - MTB crash)
    const analyzeSingleVideo = Deno.env.get('ANALYZE_SINGLE') === 'true' || Deno.args.includes('--single');
    
    if (analyzeSingleVideo) {
      console.log('🎯 Analyzing single video: MTB Crash\n');
      
      // Define the second video (MTB crash) directly
      const videoInfo = {
        cloudinaryUrl: "https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Massive_MTB_CRASH_-_Over_the_bars_erqjcv&profile=cld-default",
        publicId: "Massive_MTB_CRASH_-_Over_the_bars_erqjcv",
        localFile: "./media/Massive_MTB_CRASH___Over_the_bars_erqjcv.mp4"
      };
      
      console.log(`🎬 Processing: ${videoInfo.publicId}`);
      console.log(`📁 Local file: ${videoInfo.localFile}`);
      console.log(`☁️  Cloudinary: ${videoInfo.cloudinaryUrl}`);
      
      try {
        // Check if local file exists
        try {
          await Deno.stat(videoInfo.localFile);
        } catch (error) {
          console.log(`⚠️  Local file not found, skipping: ${videoInfo.localFile}`);
          return;
        }
        
        // Check if video has already been analyzed
        if (await isVideoAlreadyAnalyzed(videoInfo.publicId)) {
          console.log(`⏭️  Video already analyzed, skipping: ${videoInfo.publicId}`);
          return;
        }
        
        // Get file size
        const fileInfo = await Deno.stat(videoInfo.localFile);
        console.log(`📊 File size: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
        
        // Analyze video with OpenAI Vision
        const analysis = await analyzeVideoWithOpenAI(videoInfo.localFile);
        
        // Create result object
        const result: VideoAnalysisResult = {
          cloudinaryUrl: videoInfo.cloudinaryUrl,
          publicId: videoInfo.publicId,
          localFile: videoInfo.localFile,
          analysis,
          timestamp: new Date().toISOString()
        };
        
        // Log results
        console.log('\n📝 Analysis Results:');
        console.log(`   Description: ${analysis.description}`);
        console.log(`   Short filename: ${analysis.shortFilename}`);
        
        // Save individual result to file
        const safePublicId = videoInfo.publicId.replace(/[^a-zA-Z0-9]/g, '_');
        const resultFile = `./json/analysis-${safePublicId}.json`;
        await Deno.writeTextFile(resultFile, JSON.stringify(result, null, 2));
        console.log(`💾 Individual results saved to: ${resultFile}`);
        
        console.log(`\n✅ Single video analysis completed!`);
        
      } catch (error) {
        console.error(`❌ Failed to analyze ${videoInfo.publicId}:`, error.message);
      }
      
    } else {
      console.log('📋 Analyzing all videos from mapping...\n');
      
      // Load video mapping
      const videoMappings = await loadVideoMapping();
      
      if (videoMappings.length === 0) {
        console.log('📭 No video mappings found');
        return;
      }
      
      // Load existing analysis results
      const existingResults = await loadExistingAnalysisCollection();
      console.log(`📖 Loaded ${existingResults.length} existing analysis results`);
      
      const analysisResults: VideoAnalysisResult[] = [...existingResults];
      let newAnalyses = 0;
      let skippedAnalyses = 0;
      
      // Process each video from mapping
      for (let i = 0; i < videoMappings.length; i++) {
        const mapping = videoMappings[i];
        console.log(`\n🎬 Processing ${i + 1}/${videoMappings.length}: ${mapping.publicId}`);
        console.log(`📁 Local file: ${mapping.localFile}`);
        console.log(`☁️  Cloudinary: ${mapping.cloudinaryUrl}`);
        
        try {
          // Check if local file exists
          try {
            await Deno.stat(mapping.localFile);
          } catch (error) {
            console.log(`⚠️  Local file not found, skipping: ${mapping.localFile}`);
            continue;
          }
          
          // Check if video has already been analyzed
          if (await isVideoAlreadyAnalyzed(mapping.publicId)) {
            console.log(`⏭️  Video already analyzed, skipping: ${mapping.publicId}`);
            skippedAnalyses++;
            continue;
          }
          
          // Get file size
          const fileInfo = await Deno.stat(mapping.localFile);
          console.log(`📊 File size: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
          
          // Analyze video with OpenAI Vision
          const analysis = await analyzeVideoWithOpenAI(mapping.localFile);
          
          // Create result object
          const result: VideoAnalysisResult = {
            cloudinaryUrl: mapping.cloudinaryUrl,
            publicId: mapping.publicId,
            localFile: mapping.localFile,
            analysis,
            timestamp: new Date().toISOString()
          };
          
          analysisResults.push(result);
          newAnalyses++;
          
          // Log results
          console.log('\n📝 Analysis Results:');
          console.log(`   Description: ${analysis.description}`);
          console.log(`   Short filename: ${analysis.shortFilename}`);
          
          // Save individual result to file
          const safePublicId = mapping.publicId.replace(/[^a-zA-Z0-9]/g, '_');
          const resultFile = `./json/analysis-${safePublicId}.json`;
          await Deno.writeTextFile(resultFile, JSON.stringify(result, null, 2));
          console.log(`💾 Individual results saved to: ${resultFile}`);
          
        } catch (error) {
          console.error(`❌ Failed to analyze ${mapping.publicId}:`, error.message);
        }
      }
      
      // Save complete collection
      const collection: VideoAnalysisCollection = {
        videos: analysisResults,
        totalVideos: analysisResults.length,
        processedAt: new Date().toISOString()
      };
      
      const collectionFile = './json/video-analysis-collection.json';
      await Deno.writeTextFile(collectionFile, JSON.stringify(collection, null, 2));
      console.log(`\n💾 Complete analysis collection saved to: ${collectionFile}`);
      
      // Summary
      console.log(`\n📊 Analysis Summary:`);
      console.log(`   Total videos in mapping: ${videoMappings.length}`);
      console.log(`   Existing analyses: ${existingResults.length}`);
      console.log(`   New analyses: ${newAnalyses}`);
      console.log(`   Skipped (already done): ${skippedAnalyses}`);
      console.log(`   Failed: ${videoMappings.length - existingResults.length - newAnalyses - skippedAnalyses}`);
      console.log(`   Total in collection: ${analysisResults.length}`);
      
      console.log('\n✅ All videos analysis completed!');
    }
    
  } catch (error) {
    console.error('💥 Main execution failed:', error.message);
  }
}

// Run if this is the main module
// @ts-ignore
if (import.meta.main) {
  // Load configuration
  loadEnvConfig().then(loadedConfig => {
    config = loadedConfig;
    
    console.log(`🤖 Using OpenAI Vision API`);
    console.log(`🔑 API Key: ${config.OPENAI_API_KEY.substring(0, 7)}...`);
    console.log(`🎞️  Max Frames: ${config.MAX_FRAME_COUNT}\n`);
    
    processVideosFromMapping();
  }).catch(error => {
    console.error('❌ Configuration Error:', error.message);
    console.log('\n💡 Please create a config.env file with your OpenAI API key:');
    console.log('OPENAI_API_KEY=sk-your-actual-api-key-here');
  });
}