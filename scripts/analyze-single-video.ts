/// <reference types="https://deno.land/x/deno@v1.40.4/lib/deno.ns.d.ts" />

// Single Video Analyzer Script
// Analyzes just one specific video with the new single-description approach
// Run with: deno run --allow-net --allow-read --allow-write --allow-env scripts/analyze-single-video.ts

// @ts-ignore
declare const Deno: any;

import { loadEnvConfig, type Config } from './env-loader.ts';

interface VideoAnalysis {
  description: string;
  shortFilename: string;
  confidence?: number;
  tags?: string[];
  duration?: number;
  objects?: string[];
  actions?: string[];
  rawResponses?: string[];
}

interface VideoAnalysisResult {
  cloudinaryUrl: string;
  publicId: string;
  localFile: string;
  analysis: VideoAnalysis;
  timestamp: string;
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
          '-q:v', '5', // Lower quality (higher number = lower quality, max 31)
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

// Analyze multiple frames with OpenAI Vision in a single API call
async function analyzeFramesWithOpenAI(framePaths: string[], apiKey: string): Promise<VideoAnalysis> {
  try {
    console.log(`📤 Sending ${framePaths.length} frames to OpenAI Vision API for single video analysis...`);
    
    // Read all frames as base64
    const imageContents: Array<{
      type: 'image_url';
      image_url: { url: string };
    }> = [];
    
    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      console.log(`   📸 Reading frame ${i + 1}/${framePaths.length}: ${framePath}`);
      
      const frameData = await Deno.readFile(framePath);
      const base64Frame = btoa(String.fromCharCode(...frameData));
      
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Frame}`
        }
      });
    }
    
    // Create the content array with text prompt and all images
    const content: Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }> = [
      {
        type: 'text',
        text: `Analyze these ${framePaths.length} video frames and provide a single comprehensive description of the entire video content. Focus on the main subject, action, setting, and any notable details that appear across the frames. Write one cohesive description that captures the essence of the video.

Also, provide a short filename (less than 40 characters, using only letters, numbers, and underscores) that describes the main content of this video. This filename will be used for audio files, so make it descriptive but concise. Examples: "gorilla_eating_banana", "mtb_crash", "cat_plays_piano", "switzerland_nature".

Format your response as:
[Your comprehensive video description here]

[short_filename]`
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
          {
            role: 'user',
            content: content
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      })
    });
    
    const fullResponse = response.choices[0]?.message?.content || 'No description available';
    
    // Extract description and short filename from the response
    const lines = fullResponse.split('\n');
    let description = '';
    let shortFilename = '';
    
    // Look for the short filename (usually at the end)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && line.length < 40 && /^[a-zA-Z0-9_]+$/.test(line)) {
        shortFilename = line;
        description = lines.slice(0, i).join('\n').trim();
        break;
      }
    }
    
    // If no short filename found, generate one from the description
    if (!shortFilename) {
      description = fullResponse;
      // Generate a simple short filename from the first few words
      const words = fullResponse.split(' ').slice(0, 3);
      shortFilename = words
        .map(word => word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
        .filter(word => word.length > 0)
        .join('_')
        .substring(0, 30);
    }
    
    console.log(`🤖 OpenAI Response for video analysis:`);
    console.log(`   Description: ${description.substring(0, 100)}...`);
    console.log(`   Short filename: ${shortFilename}`);
    if (response.usage) {
      console.log(`   Tokens used: ${response.usage.total_tokens}`);
    }
    
    return {
      description,
      shortFilename,
      rawResponses: [JSON.stringify(response, null, 2)]
    };
    
  } catch (error) {
    console.error(`❌ Error analyzing frames:`, error.message);
    throw error;
  }
}

// Main function
async function main() {
  console.log('🎬 Single Video Analyzer - MTB Crash Video\n');
  
  try {
    // Load configuration
    const loadedConfig = await loadEnvConfig();
    config = loadedConfig;
    
    // Define the second video (MTB crash)
    const videoInfo = {
      cloudinaryUrl: "https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Massive_MTB_CRASH_-_Over_the_bars_erqjcv&profile=cld-default",
      publicId: "Massive_MTB_CRASH_-_Over_the_bars_erqjcv",
      localFile: "./media/Massive_MTB_CRASH___Over_the_bars_erqjcv.mp4"
    };
    
    console.log(`🎬 Analyzing video: ${videoInfo.publicId}`);
    console.log(`📁 Local file: ${videoInfo.localFile}`);
    console.log(`☁️  Cloudinary: ${videoInfo.cloudinaryUrl}`);
    
    // Check if local file exists
    try {
      await Deno.stat(videoInfo.localFile);
    } catch (error) {
      console.log(`❌ Local file not found: ${videoInfo.localFile}`);
      return;
    }
    
    // Get file size
    const fileInfo = await Deno.stat(videoInfo.localFile);
    console.log(`📊 File size: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Extract frames from video
    const frames = await extractVideoFrames(videoInfo.localFile, 3);
    
    if (frames.length === 0) {
      throw new Error('No frames could be extracted from the video. Please ensure ffmpeg is installed.');
    }
    
    // Analyze video with OpenAI Vision
    const analysis = await analyzeFramesWithOpenAI(frames, config.OPENAI_API_KEY);
    
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
    if (analysis.rawResponses && analysis.rawResponses.length > 0) {
      console.log(`   Raw responses: ${analysis.rawResponses.length} saved`);
    }
    
    // Save individual result to file
    const safePublicId = videoInfo.publicId.replace(/[^a-zA-Z0-9]/g, '_');
    const resultFile = `./json/analysis-${safePublicId}.json`;
    await Deno.writeTextFile(resultFile, JSON.stringify(result, null, 2));
    console.log(`💾 Results saved to: ${resultFile}`);
    
    console.log(`\n✅ Video analysis completed!`);
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run if this is the main module
// @ts-ignore
if (import.meta.main) {
  main();
} 