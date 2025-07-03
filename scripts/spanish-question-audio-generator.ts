/// <reference types="https://deno.land/x/deno@v1.40.4/lib/deno.ns.d.ts" />

// Multilingual Question and Audio Generator Script
// Generates questions and audio files with 5-second duration in specified language
// This script OVERWRITES existing JSON and audio files
// Run with: deno run --allow-net --allow-read --allow-write --allow-env scripts/spanish-question-audio-generator.ts

// @ts-ignore
declare const Deno: any;

import { loadEnvConfig, type Config } from './env-loader.ts';

interface VideoAnalysisResult {
  cloudinaryUrl: string;
  publicId: string;
  localFile: string;
  analysis: {
    description: string;
    rawResponses?: string[];
    shortFilename?: string;
    essence?: string;
  };
  timestamp: string;
}

interface VideoAnalysisCollection {
  videos: VideoAnalysisResult[];
  totalVideos: number;
  processedAt: string;
}

interface MultilingualStatement {
  statement: string;
  answer: boolean;
  explanation: string;
  wordCount: number;
  language: string;
}

interface AudioFile {
  statementId: number;
  speed: number;
  filename: string;
  duration: number;
  wordCount: number;
  transcript: string;
  answer: boolean;
  translation: string;
}

interface StatementAudioResult {
  cloudinaryUrl: string;
  publicId: string;
  audioFiles: AudioFile[];
  timestamp: string;
}

interface ElevenLabsResponse {
  audio: string; // base64 audio data
  message?: string;
}

// Language configuration
interface LanguageConfig {
  code: string;
  name: string;
  targetWords: {
    [speed: number]: { min: number; target: number; max: number };
  };
  fillerWords: string[];
  promptInstructions: string;
}

// Global config variable
let config: Config;

// Language configurations
const languageConfigs = {
  spanish: {
    name: 'Spanish',
    code: 'es'
  },
  english: {
    name: 'English', 
    code: 'en'
  },
  french: {
    name: 'French',
    code: 'fr'
  },
  german: {
    name: 'German',
    code: 'de'
  },
  italian: {
    name: 'Italian',
    code: 'it'
  },
  portuguese: {
    name: 'Portuguese',
    code: 'pt'
  }
};

// Single prompt for all languages
const LANGUAGE_LEARNING_PROMPT = 'You are a language learning app creating true/false statements for language learners at A1-A2 level. Create a clear, factual statement in the target language based on this video description. Use ONLY the most common 1000 words that beginners would know. Avoid complex grammar, idioms, or advanced vocabulary. The statement should be simple, direct, and easy to understand for language learners. Use present tense and basic sentence structures. Do not ask the user anything or mention the video. Never use phrases like "in the video", "the video shows", "we can see", "the clip", or any reference to watching or viewing. Just state a fact that can be determined as true or false based on the video content, as if describing what is happening directly. Make sure the statement is unambiguous and clearly true or false. Focus on the primary event, item, or action of the video.';

// Updated prompt for controlled true/false generation
const TRUE_STATEMENT_PROMPT = 'You are a language learning app creating TRUE statements for language learners at A1-A2 level. Create a clear, factual TRUE statement in the target language based on this video description. Use ONLY the most common 1000 words that beginners would know. Avoid complex grammar, idioms, or advanced vocabulary. The statement should be simple, direct, and easy to understand for language learners. Use present tense and basic sentence structures. Do not ask the user anything or mention the video. Never use phrases like "in the video", "the video shows", "we can see", "the clip", or any reference to watching or viewing. Just state a TRUE fact that can be observed from the video content. Focus on the primary event, item, or action shown in the video.';

const FALSE_STATEMENT_PROMPT = 'You are a language learning app creating FALSE statements for language learners at A1-A2 level. Create a clear, factual FALSE statement in the target language based on this video description. Use ONLY the most common 1000 words that beginners would know. Avoid complex grammar, idioms, or advanced vocabulary. The statement should be simple, direct, and easy to understand for language learners. Use present tense and basic sentence structures. Do not ask the user anything or mention the video. Never use phrases like "in the video", "the video shows", "we can see", "the clip", or any reference to watching or viewing. \n\nIMPORTANT: Do NOT use direct opposites or negations like "not", "no", "never", "doesn\'t", "isn\'t", etc. Instead, create a completely different scenario that is clearly false but sounds natural. For example, if someone is eating a banana, don\'t say "they are not eating a banana" - instead say something like "they are eating a pizza" or "they are reading a book". Make the false statement about a different action, object, location, or situation that would be impossible given the video content.';

// Array of false statement types
const FALSE_STATEMENT_TYPES = [
  'describes a completely different activity',
  'mentions wrong objects or items',
  'describes a different location or setting',
  'includes impossible or unrealistic details',
  'describes different people or animals',
  'mentions wrong colors or clothing',
  'describes different weather or time of day',
  'includes impossible actions or behaviors'
];

// Function to get random false statement type
function getRandomFalseType(): string {
  return FALSE_STATEMENT_TYPES[Math.floor(Math.random() * FALSE_STATEMENT_TYPES.length)];
}

// Generate FALSE statement prompt dynamically
function getFalseStatementPrompt(falseType: string): string {
  return `You are a language learning app creating FALSE statements for language learners at A1-A2 level. Create a clear, factual FALSE statement in the target language based on this video description. Use ONLY the most common 1000 words that beginners would know. Avoid complex grammar, idioms, or advanced vocabulary. The statement should be simple, direct, and easy to understand for language learners. Use present tense and basic sentence structures. Do not ask the user anything or mention the video. Never use phrases like "in the video", "the video shows", "we can see", "the clip", or any reference to watching or viewing. \n\nIMPORTANT: Do NOT use direct opposites or negations like "not", "no", "never", "doesn\'t", "isn\'t", etc. Instead, create a completely different scenario that is clearly false but sounds natural. Make the false statement ${falseType} by describing a different action, object, location, or situation that would be impossible given the video content. The statement MUST be FALSE based on the video content.`;
}

// Speed configurations
const speedConfigs = [
  { speed: 0.7, targetWords: 10 },
  { speed: 0.8, targetWords: 12 },
  { speed: 0.9, targetWords: 14 },
  { speed: 1.0, targetWords: 16 },
  { speed: 1.1, targetWords: 18 },
  { speed: 1.2, targetWords: 20 }
];

// Configuration for this run
const RUN_CONFIG = {
  language: 'spanish' as keyof typeof languageConfigs,
  targetVideoIndex: 0, // Start from the first video
  maxVideos: 1, // Process only 1 video
  targetSpeed: null as number | null, // If null, run all speeds; otherwise, run only the specified speed
  skipAudio: true, // Set to true to skip audio generation and just log text
  targetVideoId: "BASE_jumping_Switzerland_am0306" as string | null, // Set to specific video filename or public ID to process only that video
  targetAnswer: true as boolean | null // Set to true/false to force specific answer, null for random
};

// Load video analysis collection
async function loadVideoAnalysis(): Promise<VideoAnalysisResult[]> {
  try {
    console.log(`📖 Loading individual video analysis files...`);
    
    // Read all files in the json directory
    const jsonDir = './json';
    const files: string[] = [];
    
    for await (const entry of Deno.readDir(jsonDir)) {
      if (entry.isFile && entry.name.startsWith('analysis-') && entry.name.endsWith('.json')) {
        files.push(entry.name);
      }
    }
    
    console.log(`📁 Found ${files.length} analysis files`);
    
    const videos: VideoAnalysisResult[] = [];
    
    for (const filename of files) {
      try {
        const filePath = `${jsonDir}/${filename}`;
        const content = await Deno.readTextFile(filePath);
        const analysis = JSON.parse(content);
        
        // Convert to VideoAnalysisResult format
        const video: VideoAnalysisResult = {
          cloudinaryUrl: analysis.cloudinaryUrl,
          publicId: analysis.publicId,
          localFile: analysis.localFile,
          analysis: {
            description: analysis.analysis.description,
            shortFilename: analysis.analysis.shortFilename,
            essence: analysis.analysis.essence
          },
          timestamp: analysis.timestamp
        };
        
        videos.push(video);
        console.log(`✅ Loaded: ${analysis.analysis.shortFilename || analysis.publicId}`);
        
      } catch (error) {
        console.error(`❌ Error loading ${filename}:`, error.message);
      }
    }
    
    console.log(`✅ Loaded ${videos.length} video analyses`);
    return videos;
    
  } catch (error) {
    console.error(`❌ Error loading video analysis:`, error.message);
    console.log(`💡 Make sure analysis files exist in ./json/ directory`);
    throw error;
  }
}

// Generate statement using OpenAI
async function generateStatement(videoDescription: string, language: string, targetAnswer?: boolean, targetWordCount?: number): Promise<MultilingualStatement[]> {
  try {
    const langConfig = languageConfigs[language as keyof typeof languageConfigs];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }
    
    console.log(`🤖 Generating ${langConfig.name} statement (target: ${targetAnswer ? 'TRUE' : 'FALSE'})...`);
    
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env');
    }
    
    // Choose the appropriate prompt based on target answer
    const basePrompt = targetAnswer ? TRUE_STATEMENT_PROMPT : FALSE_STATEMENT_PROMPT;
    const falseType = targetAnswer ? '' : `\n\nMake the statement ${FALSE_STATEMENT_TYPES[Math.floor(Math.random() * FALSE_STATEMENT_TYPES.length)]}.`;
    
    // Include essence in the prompt if available
    const essenceInfo = '';
    
    const prompt = `${basePrompt}${falseType}

Video description: ${videoDescription}${essenceInfo}

Generate a single statement in ${langConfig.name} with approximately ${targetWordCount || 15} words.

Return ONLY a JSON object with this exact structure:
{
  "statement": "your statement here",
  "wordCount": 15
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let statement;
    try {
      const parsed = JSON.parse(content);
      statement = parsed;
    } catch (e) {
      console.error('Failed to parse OpenAI response as JSON:', content);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // Convert to MultilingualStatement format
    const result: MultilingualStatement[] = [{
      statement: statement.statement,
      answer: targetAnswer || false,
      explanation: targetAnswer ? 'This statement is true based on the video content.' : 'This statement is false and contradicts the video content.',
      wordCount: statement.wordCount || statement.statement.split(' ').length,
      language: langConfig.code
    }];

    return result;

  } catch (error) {
    console.error('❌ Error generating statement:', error);
    throw error;
  }
}

// Generate audio using ElevenLabs API
async function generateAudio(text: string, speed: number, filename: string): Promise<{ duration: number; wordCount: number }> {
  try {
    console.log(`🎵 Generating audio for speed ${speed}x: ${filename}`);
    
    if (!config.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not set in config.env');
    }
    
    // Calculate target duration based on speed (slower speed = longer duration)
    const baseDuration = 4.0; // Base duration in seconds
    const targetDuration = baseDuration / speed;
    
    // Calculate stability and similarity boost based on speed
    const stability = Math.max(0.3, 0.8 - (speed - 0.7) * 0.2); // Higher stability for slower speeds
    const similarityBoost = Math.max(0.5, 0.8 - (speed - 0.7) * 0.15); // Higher similarity for slower speeds
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': config.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost,
          style: 0.0,
          use_speaker_boost: true,
          speed: speed
        },
        output_format: 'mp3_44100_128'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    const audioData = new Uint8Array(audioBuffer);
    
    // Save audio file
    await Deno.writeFile(`audio/${filename}`, audioData);
    
    // Calculate actual duration from file size and bitrate
    const fileSizeBytes = audioData.length;
    const bitrate = 128000; // 128 kbps as specified in output_format
    const actualDuration = (fileSizeBytes * 8) / bitrate; // Convert bytes to bits, then divide by bitrate
    
    const wordCount = text.split(/\s+/).length;
    
    console.log(`✅ Audio generated: ${filename} (${actualDuration.toFixed(1)}s, ${wordCount} words)`);
    
    return {
      duration: actualDuration,
      wordCount
    };
    
  } catch (error) {
    console.error(`❌ Error generating audio:`, error.message);
    throw error;
  }
}

// Check if audio file already exists
async function audioFileExists(filename: string): Promise<boolean> {
  try {
    await Deno.stat(`audio/${filename}`);
    return true;
  } catch {
    return false;
  }
}

// Process a single video
async function processVideo(video: VideoAnalysisResult, language: string): Promise<StatementAudioResult> {
  console.log(`\n🎬 Processing video: ${video.publicId}`);
  
  const audioFiles: AudioFile[] = [];
  const statements: MultilingualStatement[] = [];
  // Use shortFilename from analysis if available, otherwise use publicId
  const shortFilename = video.analysis.shortFilename || video.publicId;
  const baseFilename = `s_${shortFilename}`; // Shorter prefix
  
  // Determine which speeds to use
  const filteredSpeedConfigs = RUN_CONFIG.targetSpeed === null
    ? speedConfigs
    : speedConfigs.filter(config => config.speed === RUN_CONFIG.targetSpeed);
  
  // Generate statements and audio for each speed
  for (const speedConfig of filteredSpeedConfigs) {
    const audioFilename = `${baseFilename}_speed${speedConfig.speed}.mp3`;
    
    console.log(`\n📝 Generating statement for speed ${speedConfig.speed}x...`);
    
    const targetWords = speedConfig.targetWords;
    console.log(`   Target words: ~${targetWords}`);
    
    // Randomly assign true or false for this speed
    const targetAnswer = RUN_CONFIG.targetAnswer !== null ? RUN_CONFIG.targetAnswer : Math.random() < 0.5; // Use configured answer or random
    console.log(`   Target answer: ${targetAnswer ? 'TRUE' : 'FALSE'}${RUN_CONFIG.targetAnswer !== null ? ' (configured)' : ' (random)'}`);
    
    let finalStatement: MultilingualStatement | null = null;
    let finalDuration = 0;
    let attempts = 0;
    const maxAttempts = 5;
    let currentTargetWords = targetWords;
    let lastStatementResult: MultilingualStatement[] = [];
    let lastAudioResult: { duration: number; wordCount: number } | null = null;
    let finalTranslation: string | null = null;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`🤖 Generating Spanish statement (target: ${targetAnswer ? 'TRUE' : 'FALSE'})...`);
      
      if (!targetAnswer) {
        const falseType = getRandomFalseType();
        console.log(`   False statement type: ${falseType}`);
      }
      
      console.log(`   Target word count: ~${currentTargetWords}`);
      
      // Generate a single statement with current target word count
      const statementResult = await generateStatement(video.analysis.description, language, targetAnswer, currentTargetWords);
      const statement = statementResult[0]; // Take the first generated statement
      lastStatementResult = statementResult; // Keep track of the last result
      
      console.log(`   Attempt ${attempts}: Statement: ${statement.statement}`);
      console.log(`   Word count: ${statement.wordCount}, Answer: ${statement.answer}`);
      
      if (RUN_CONFIG.skipAudio) {
        // Skip audio generation and just log the text
        console.log(`   🔊 SKIP_AUDIO flag set - skipping audio generation`);
        console.log(`   📝 Generated text: "${statement.statement}"`);
        
        // Generate and log English translation immediately
        const translation = await generateTranslation(statement.statement);
        console.log(`   🌐 English translation: "${translation}"`);
        
        finalStatement = statement;
        finalDuration = 0; // No audio duration when skipping
        finalTranslation = translation; // Store the translation for later use
        break;
      }
      
      try {
        const filename = `${baseFilename}_speed${speedConfig.speed}.mp3`;
        const audioResult = await generateAudio(statement.statement, speedConfig.speed, filename);
        
        console.log(`   Audio generated: ${filename} (${audioResult.duration.toFixed(1)}s, ${audioResult.wordCount} words)`);
        
        // Check if duration is within acceptable range (4.5-5.5 seconds)
        if (audioResult.duration >= 4.5 && audioResult.duration <= 5.5) {
          console.log(`   ✅ Duration acceptable: ${audioResult.duration.toFixed(1)}s`);
          finalStatement = statement;
          finalDuration = audioResult.duration;
          lastAudioResult = audioResult;
          break;
        } else if (audioResult.duration < 4.5) {
          console.log(`   ⚠️  Duration ${audioResult.duration.toFixed(1)}s too short, increasing word count...`);
          // Increase target words for next attempt
          currentTargetWords = Math.min(currentTargetWords + 5, 50); // Add 5 words, max 50
        } else {
          console.log(`   ⚠️  Duration ${audioResult.duration.toFixed(1)}s too long, decreasing word count...`);
          // Decrease target words for next attempt
          currentTargetWords = Math.max(currentTargetWords - 3, 5); // Subtract 3 words, min 5
        }
        
        // Keep track of the last audio result
        lastAudioResult = audioResult;
      } catch (error) {
        console.error(`   ❌ Error generating audio:`, error.message);
        // Continue to next attempt on error
      }
    }
    
    // If we didn't find a perfect match, use the last attempt
    if (!finalStatement && lastStatementResult.length > 0) {
      const actualDuration = lastAudioResult ? lastAudioResult.duration : 0;
      console.log(`   ⚠️  Using final attempt with duration ${actualDuration.toFixed(1)}s`);
      finalStatement = lastStatementResult[0];
      finalDuration = actualDuration;
    }
    
    if (finalStatement) {
      console.log(`   ✅ Final statement: "${finalStatement.statement}"`);
      if (!RUN_CONFIG.skipAudio) {
        console.log(`   ✅ Final duration: ${finalDuration.toFixed(1)}s`);
      }
      
      // Generate English translation if not already done
      const translation = finalTranslation || await generateTranslation(finalStatement.statement);
      
      // Add to results
      const audioFile: AudioFile = {
        statementId: audioFiles.length + 1,
        speed: speedConfig.speed,
        filename: RUN_CONFIG.skipAudio ? 'SKIPPED' : `${baseFilename}_speed${speedConfig.speed}.mp3`,
        duration: finalDuration,
        wordCount: finalStatement.wordCount,
        transcript: finalStatement.statement,
        answer: finalStatement.answer,
        translation: translation
      };
      
      audioFiles.push(audioFile);
      statements.push(finalStatement);
    }
  }
  
  // Create result object
  const result: StatementAudioResult = {
    cloudinaryUrl: video.cloudinaryUrl,
    publicId: video.publicId,
    audioFiles,
    timestamp: new Date().toISOString()
  };
  
  return result;
}

// Generate English translation of Spanish statement
async function generateTranslation(spanishStatement: string): Promise<string> {
  try {
    console.log(`🌐 Generating English translation...`);
    
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env');
    }
    
    const prompt = `Translate this Spanish statement to English. Return ONLY the English translation, nothing else.

Spanish: "${spanishStatement}"

English translation:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.3,
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const translation = data.choices[0].message.content.trim();
    
    console.log(`   Translation: "${translation}"`);
    return translation;

  } catch (error) {
    console.error('❌ Error generating translation:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    const language = 'spanish'; // Hardcoded to Spanish for now
    const langConfig = languageConfigs[language as keyof typeof languageConfigs];
    
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }
    
    // Load configuration
    const loadedConfig = await loadEnvConfig();
    config = loadedConfig;
    
    // Check required API keys
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env');
    }
    if (!config.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not set in config.env');
    }
    
    console.log('🌍 Multilingual Statement Generator');
    console.log(`🎯 Language: ${langConfig.name} (${langConfig.code})`);
    console.log('');
    console.log(`🤖 Using OpenAI API`);
    console.log(`🎵 Using ElevenLabs API`);
    console.log(`🔑 OpenAI Key: ${config.OPENAI_API_KEY.substring(0, 7)}...`);
    console.log(`🔑 ElevenLabs Key: ${config.ELEVENLABS_API_KEY.substring(0, 7)}...`);
    console.log(`🔊 Audio Generation: ${RUN_CONFIG.skipAudio ? 'SKIPPED' : 'ENABLED'}`);
    if (RUN_CONFIG.targetVideoId) {
      console.log(`🎬 Target Video: ${RUN_CONFIG.targetVideoId}`);
    }
    if (RUN_CONFIG.targetAnswer !== null) {
      console.log(`✅ Target Answer: ${RUN_CONFIG.targetAnswer ? 'TRUE' : 'FALSE'}`);
    }
    console.log('');
    
    // Load video analysis
    const videos = await loadVideoAnalysis();
    
    if (videos.length === 0) {
      console.log('📭 No video analyses found');
      return;
    }
    
    // Process only the configured number of videos
    let videosToProcess: VideoAnalysisResult[];
    
    if (RUN_CONFIG.targetVideoId) {
      // Filter by specific video ID
      const targetVideo = videos.find(video => 
        video.publicId === RUN_CONFIG.targetVideoId || 
        video.analysis.shortFilename === RUN_CONFIG.targetVideoId ||
        (RUN_CONFIG.targetVideoId && video.localFile.includes(RUN_CONFIG.targetVideoId))
      );
      
      if (targetVideo) {
        videosToProcess = [targetVideo];
        console.log(`🎯 Processing specific video: ${RUN_CONFIG.targetVideoId}`);
      } else {
        console.log(`❌ Video not found: ${RUN_CONFIG.targetVideoId}`);
        console.log(`📋 Available videos:`);
        videos.forEach(video => {
          console.log(`   - ${video.analysis.shortFilename || video.publicId}`);
        });
        return;
      }
    } else {
      // Use index-based filtering
      videosToProcess = RUN_CONFIG.maxVideos === -1 
        ? videos.slice(RUN_CONFIG.targetVideoIndex) 
        : videos.slice(RUN_CONFIG.targetVideoIndex, RUN_CONFIG.targetVideoIndex + RUN_CONFIG.maxVideos);
      console.log(`🎯 Processing ${videosToProcess.length} video(s) starting from index ${RUN_CONFIG.targetVideoIndex}`);
    }
    
    console.log('');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < videosToProcess.length; i++) {
      const video = videosToProcess[i];
      console.log(`📹 Processing video ${i + 1}/${videosToProcess.length}: ${video.publicId}\n`);
      
      try {
        const result = await processVideo(video, language);
        
        // Save result
        const shortFilename = video.analysis.shortFilename || video.publicId;
        const resultFile = `./json/${language}-s-${shortFilename}.json`;
        await Deno.writeTextFile(resultFile, JSON.stringify(result, null, 2));
        console.log(`\n💾 Results saved to: ${resultFile}`);
        
        // Summary
        console.log(`\n📊 Summary:`);
        console.log(`   Video: ${video.analysis.shortFilename || video.publicId}`);
        console.log(`   Language: Spanish (es)`);
        console.log(`   First Statement: ${result.audioFiles[0].transcript}`);
        console.log(`   First Answer: ${result.audioFiles[0].answer}`);
        console.log(`   Statements generated: ${result.audioFiles.length}`);
        if (RUN_CONFIG.skipAudio) {
          console.log(`   Audio Generation: SKIPPED`);
        }
        
        successCount++;
        
      } catch (error) {
        console.error(`❌ Failed to process video ${video.publicId}:`, error.message);
        errorCount++;
      }
      
      // Add a small delay between videos to avoid rate limiting
      if (i < videosToProcess.length - 1) {
        console.log(`\n⏳ Waiting 2 seconds before next video...\n`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n📈 Final Summary:`);
    console.log(`   Total videos processed: ${videosToProcess.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${errorCount}`);
    console.log(`\n✅ ${langConfig.name} statement generation completed!`);
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run if this is the main module
// @ts-ignore
if (import.meta.main) {
  main();
}