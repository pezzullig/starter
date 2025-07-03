/// <reference types="https://deno.land/x/deno@v1.40.4/lib/deno.ns.d.ts" />

// Bulk Question Generator Script
// Generates multiple English statements, allows selection, generates audio in multiple speeds, and allows final selection
// This script OVERWRITES existing JSON and audio files
// Run with: deno run --allow-net --allow-read --allow-write --allow-env scripts/bulk-question-generator.ts

// @ts-ignore
declare const Deno: any;

import { loadEnvConfig, type Config } from './env-loader.ts';

interface VideoAnalysisResult {
  cloudinaryUrl: string;
  publicId: string;
  analysis: {
    description: string;
    rawResponses?: string[];
    shortFilename?: string;
    essence?: string;
    targetAnswer?: boolean;
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
  charactersPerSecond?: number;
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
const TRUE_STATEMENT_PROMPT = `You are a language learning app. 

Here is a statement you are allowed to summarize down to make it shorter, but don't add any more context.

Use ONLY the most common 1000 words that beginners would know. 
Avoid complex grammar, idioms, or advanced vocabulary. 
The statement should be simple, direct, and easy to understand for language learners. 
Use present tense and basic sentence structures. 

Do not ask the user anything or mention the video. 
Never use phrases like "in the video", "the video shows", "we can see", "the clip", or any reference to watching or viewing. 

Just state a TRUE fact that can be observed from the video content. 
Focus on the primary event, item, or action shown in the video.`;

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
  maxVideos: 70, // Process 70 videos
  targetSpeed: null as number | null, // If null, run all speeds; otherwise, run only the specified speed
  skipAudio: false, // Set to false to generate audio
  targetVideoId: null as string | null, // Test with Switzerland landscape
  targetAnswer: true as boolean | null, // Set to true/false to force specific answer, null for random
  statementsToGenerate: 10, // Number of statements to generate initially (2 per speed)
  audioSpeeds: [0.7, 0.8, 0.9, 1.0, 1.1, 1.2], // Speeds for audio generation
  voiceId: "21m00Tcm4TlvDq8ikWAM", // Voice ID to use for analysis
  autoSelectAllStatements: true, // If true, automatically select all 10 statements without user input
  autoSelectAllAudio: true, // If true, automatically select all audio files without user input
  cutoffTimestamp: "2025-07-02T09:00:00.000Z" // Skip videos with Spanish JSON files newer than this morning 9am
};

// Voice analysis interface
interface VoiceAnalysis {
  voiceId: string;
  summary: {
    overallAverageCharactersPerSecond: number;
    speedAverages: Array<{
      speed: number;
      averageCharactersPerSecond: number;
      averageDuration: number;
      statementCount: number;
    }>;
  };
}

// Interface for statement selection
interface StatementCandidate {
  id: number;
  statement: string;
  answer: boolean;
  selected: boolean;
}

// Interface for audio selection
interface AudioCandidate {
  id: string;
  statement: string;
  speed: number;
  duration: number;
  filename: string;
  selected: boolean;
  translation: string;
}

// Load video analysis from the new JSON file
async function loadVideoAnalysis(): Promise<VideoAnalysisResult[]> {
  try {
    console.log(`📖 Loading video analysis from JSON file...`);
    
    // Load from the new CSV-generated JSON file
    const jsonFilePath = './json/video-analysis-collection-from-csv.json';
    
    try {
      const content = await Deno.readTextFile(jsonFilePath);
      const collection: VideoAnalysisCollection = JSON.parse(content);
      
      console.log(`📁 Found ${collection.videos.length} videos in collection`);
      
      const videos: VideoAnalysisResult[] = [];
      const skippedVideos: string[] = [];
      
      for (const video of collection.videos) {
        // Only include videos that have a targetAnswer set
        if (video.analysis.targetAnswer !== undefined && video.analysis.targetAnswer !== null) {
          videos.push(video);
          console.log(`✅ Loaded: ${video.analysis.shortFilename || video.publicId} (targetAnswer: ${video.analysis.targetAnswer})`);
        } else {
          skippedVideos.push(video.analysis.shortFilename || video.publicId);
          console.log(`⏭️  Skipped: ${video.analysis.shortFilename || video.publicId} (no targetAnswer set)`);
        }
      }
      
      console.log(`✅ Loaded ${videos.length} video analyses with targetAnswer set`);
      if (skippedVideos.length > 0) {
        console.log(`⏭️  Skipped ${skippedVideos.length} videos without targetAnswer: ${skippedVideos.join(', ')}`);
      }
      return videos;
      
    } catch (error) {
      console.error(`❌ Error loading JSON file:`, error.message);
      throw new Error(`Could not load ${jsonFilePath}. Make sure the CSV to JSON conversion was run first.`);
    }
    
  } catch (error) {
    console.error(`❌ Error loading video analysis:`, error.message);
    throw error;
  }
}

// Load voice analysis data
async function loadVoiceAnalysis(): Promise<VoiceAnalysis> {
  try {
    const voiceAnalysisFile = `voice/${RUN_CONFIG.voiceId}/analysis.json`;
    const content = await Deno.readTextFile(voiceAnalysisFile);
    const analysis = JSON.parse(content);
    
    console.log(`🎤 Loaded voice analysis for ${analysis.voiceId}`);
    console.log(`📊 Overall average: ${analysis.summary.overallAverageCharactersPerSecond.toFixed(1)} characters/s`);
    
    return analysis;
  } catch (error) {
    console.error(`❌ Error loading voice analysis:`, error.message);
    throw new Error(`Voice analysis not found for ${RUN_CONFIG.voiceId}. Run voice-analyzer.ts first.`);
  }
}

// Calculate target character count for 4.5 second duration using actual voice analysis data
function calculateTargetCharacters(speed: number, voiceAnalysis: VoiceAnalysis): { min: number; target: number; max: number } {
  const speedData = voiceAnalysis.summary.speedAverages.find(s => s.speed === speed);
  if (!speedData) {
    throw new Error(`No voice analysis data for speed ${speed}`);
  }
  
  const charsPerSecond = speedData.averageCharactersPerSecond;
  
  // Target exactly 4.5 seconds
  const targetChars = Math.floor(4.5 * charsPerSecond);
  
  // Allow a small range around the target (±5%)
  const minChars = Math.floor(targetChars * 0.95);
  const maxChars = Math.ceil(targetChars * 1.05);
  
  return { min: minChars, target: targetChars, max: maxChars };
}

// Check if estimated audio duration would be too long (> 5.5 seconds)
function wouldAudioBeTooLong(characterCount: number, speed: number, voiceAnalysis: VoiceAnalysis): boolean {
  const speedData = voiceAnalysis.summary.speedAverages.find(s => s.speed === speed);
  if (!speedData) {
    return true; // Assume too long if no data
  }
  
  const charsPerSecond = speedData.averageCharactersPerSecond;
  const estimatedDuration = characterCount / charsPerSecond;
  
  return estimatedDuration > 5.5;
}

// Check if actual audio duration is too long (> 5.5 seconds)
function isAudioTooLong(actualDuration: number): boolean {
  return actualDuration > 5.5;
}

// Generate one statement with translation in a single API call
async function generateSingleStatement(
  videoDescription: string, 
  targetAnswer: boolean, 
  targetChars: number,
  statementNumber: number,
  approximateWordCount: number
): Promise<{ english: string; spanish: string; characterCount: number }> {
  try {
    console.log(`🤖 Generating statement ${statementNumber}/10 (target: ${targetChars} chars, ~${approximateWordCount} words)...`);
    
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env');
    }
    
    // Always generate TRUE statements, but we'll store them as the target answer
    const prompt = `${TRUE_STATEMENT_PROMPT}

Video description: ${videoDescription}

Additional requirements:
- Focus DIRECTLY on the specific details in the video description above
- The Spanish statement should be ROUGHLY ${targetChars} characters long (within ±10% is acceptable)
- The statement should be approximately ${approximateWordCount} words long
- IMPORTANT: Base your statement ONLY on what is described in the video description. Do not add extra details or assumptions.
- CRITICAL: Be creative and varied. Focus on different aspects, actions, or details from the video description.
- Avoid generating the same basic statement with minor variations. Each statement should be distinctly different.

Return ONLY a JSON object with this exact structure:
{
  "english": "English statement here",
  "spanish": "Spanish translation here"
}

Do not include any other text, just the JSON object.`;

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
        temperature: 0.9,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse OpenAI response as JSON:', content);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // Validate and calculate character count
    const english = result.english || result.English || result.statement || `English statement ${statementNumber}`;
    const spanish = result.spanish || result.Spanish || result.translation || `Spanish translation ${statementNumber}`;
    const characterCount = spanish.length; // Calculate character count outside AI call
    
    const statement = {
      english,
      spanish,
      characterCount
    };

    console.log(`   ✅ "${english}" → "${spanish}" (${characterCount} chars)`);

    return statement;

  } catch (error) {
    console.error(`❌ Error generating statement ${statementNumber}:`, error);
    throw error;
  }
}

// Generate 10 statements with 2 per speed using individual API calls
async function generateMultipleStatements(
  videoDescription: string, 
  targetAnswer: boolean, 
  voiceAnalysis: VoiceAnalysis
): Promise<Array<{ english: string; spanish: string; characterCount: number }> > {
  try {
    console.log(`🤖 Generating 10 statements (2 per speed) for 4.5 second duration...`);
    
    const statements: Array<{ english: string; spanish: string; characterCount: number }> = [];
    
    // Generate 2 statements for each speed (10 total)
    const speeds = RUN_CONFIG.audioSpeeds;
    
    for (let speedIndex = 0; speedIndex < speeds.length; speedIndex++) {
      const speed = speeds[speedIndex];
      
      // Calculate target character count for this speed
      const targetChars = calculateTargetCharacters(speed, voiceAnalysis);
      
      // Generate 2 statements for this speed
      for (let stmtIndex = 0; stmtIndex < 2; stmtIndex++) {
        const statementNumber = speedIndex * 2 + stmtIndex + 1;
        
        // Use the exact target character count for 4.5 seconds
        const exactTargetChars = targetChars.target;
        
        try {
          // Calculate approximate word count (roughly 5 characters per word)
          const approximateWordCount = Math.floor(exactTargetChars / 5);
          const statement = await generateSingleStatement(videoDescription, targetAnswer, exactTargetChars, statementNumber, approximateWordCount);
          
          // Filter 1: Check if estimated audio duration would be too long
          if (wouldAudioBeTooLong(statement.characterCount, speed, voiceAnalysis)) {
            const estimatedDuration = statement.characterCount / voiceAnalysis.summary.speedAverages.find(s => s.speed === speed)!.averageCharactersPerSecond;
            console.log(`   ⏭️  Skipping statement ${statementNumber} - estimated duration ${estimatedDuration.toFixed(2)}s > 5.5s (${statement.characterCount} chars)`);
            continue;
          }
          
          statements.push(statement);
          
          // Small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`❌ Failed to generate statement ${statementNumber}, skipping...`);
          // Continue with next statement instead of failing completely
          continue;
        }
      }
    }

    console.log(`✅ Generated ${statements.length} statement pairs`);
    if (statements.length > 0) {
      console.log(`📊 Character count range: ${Math.min(...statements.map(s => s.characterCount))} - ${Math.max(...statements.map(s => s.characterCount))}`);
    }

    return statements;

  } catch (error) {
    console.error('❌ Error generating multiple statements:', error);
    throw error;
  }
}

// Get audio duration using afinfo (macOS built-in)
async function getAudioDuration(audioFilePath: string): Promise<number> {
  try {
    const process = Deno.run({
      cmd: ['afinfo', audioFilePath],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const status = await process.status();
    
    if (!status.success) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      throw new Error(`afinfo failed: ${errorOutput}`);
    }
    
    const output = new TextDecoder().decode(await process.output());
    
    // Parse the estimated duration line
    const durationMatch = output.match(/estimated duration:\s*([\d.]+)\s*sec/);
    if (!durationMatch) {
      throw new Error(`Could not find duration in afinfo output`);
    }
    
    const duration = parseFloat(durationMatch[1]);
    
    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${durationMatch[1]}`);
    }
    
    return duration;
    
  } catch (error) {
    throw new Error(`Error getting audio duration: ${error.message}`);
  }
}

// Generate audio using ElevenLabs API
async function generateAudio(text: string, speed: number, filename: string): Promise<{ duration: number; wordCount: number; charactersPerSecond: number }> {
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
    
    // Create statements subfolder if it doesn't exist
    try {
      await Deno.mkdir('audio/statements', { recursive: true });
    } catch {
      // Folder already exists, ignore
    }
    
    // Save audio file in statements subfolder
    await Deno.writeFile(`audio/statements/${filename}`, audioData);
    
    // Get exact duration using afinfo
    const duration = await getAudioDuration(`audio/statements/${filename}`);
    const wordCount = text.split(/\s+/).length;
    const charactersPerSecond = text.length / duration;
    
    console.log(`✅ Audio generated: ${filename} (${duration.toFixed(3)}s, ${wordCount} words, ${charactersPerSecond.toFixed(2)} chars/sec)`);
    
    return {
      duration,
      wordCount,
      charactersPerSecond
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

// Check if Spanish JSON file exists and is more recent than cutoff timestamp
async function shouldSkipVideo(videoShortFilename: string, cutoffTimestamp: string | null): Promise<{ skip: boolean; reason?: string }> {
  if (!cutoffTimestamp) {
    return { skip: false };
  }
  
  const jsonFilePath = `./json/spanish-s-${videoShortFilename}.json`;
  
  try {
    const fileInfo = await Deno.stat(jsonFilePath);
    const fileTimestamp = new Date(fileInfo.mtime || fileInfo.birthtime).toISOString();
    
    if (fileTimestamp > cutoffTimestamp) {
      return { 
        skip: true, 
        reason: `Spanish JSON file is more recent (${fileTimestamp}) than cutoff (${cutoffTimestamp})` 
      };
    }
  } catch {
    // File doesn't exist, don't skip
    return { skip: false };
  }
  
  return { skip: false };
}

// Process a single video with the new bulk generation workflow
async function processVideo(video: VideoAnalysisResult, language: string, voiceAnalysis: VoiceAnalysis): Promise<StatementAudioResult> {
  const shortFilename = video.analysis.shortFilename || video.publicId;
  console.log(`\n🎬 Processing video: ${shortFilename}`);
  
  // Get target answer from analysis file if available, otherwise use config
  const videoTargetAnswer = video.analysis.targetAnswer !== undefined ? video.analysis.targetAnswer : RUN_CONFIG.targetAnswer;
  console.log(`🎯 Using target answer from analysis: ${videoTargetAnswer !== null ? (videoTargetAnswer ? 'TRUE' : 'FALSE') : 'RANDOM'}`);
  
  // Calculate character ranges for all speeds
  const charSpeedsToUse = RUN_CONFIG.targetSpeed !== null 
    ? [RUN_CONFIG.targetSpeed] 
    : RUN_CONFIG.audioSpeeds;
  
  console.log(`🎵 Using speeds: ${charSpeedsToUse.join(', ')}x`);
  
  // Calculate min and max character counts across all speeds
  const allTargetChars = charSpeedsToUse.map(speed => calculateTargetCharacters(speed, voiceAnalysis));
  const minChars = Math.min(...allTargetChars.map(tc => tc.min));
  const maxChars = Math.max(...allTargetChars.map(tc => tc.max));
  
  console.log(`📏 Character range for all speeds: ${minChars} - ${maxChars} characters`);
  
  // Generate all statements in one API call
  const allStatements = await generateMultipleStatements(video.analysis.description, videoTargetAnswer || false, voiceAnalysis);
  
  // Remove exact English duplicates
  console.log(`\n🧹 Removing duplicate statements...`);
  const uniqueStatements = removeDuplicateStatements(allStatements);
  
  // Show character targets for each speed
  console.log(`\n🎯 Character targets for 4.5 seconds (from voice analysis):`);
  charSpeedsToUse.forEach(speed => {
    const targetChars = calculateTargetCharacters(speed, voiceAnalysis);
    console.log(`   ${speed}x: ${targetChars.target} chars (range: ${targetChars.min}-${targetChars.max})`);
  });
  
  // Let user select statements
  console.log(`\n📋 Select statements (ENTER = accept, n = reject):`);
  console.log(`💡 Tip: You have 2 statements for each speed (0.7x, 0.8x, 0.9x, 1.0x, 1.1x)`);
  const userSelectedStatements: Array<{ english: string; spanish: string; characterCount: number }> = [];
  
  // Check if auto-select is enabled
  if (RUN_CONFIG.autoSelectAllStatements) {
    console.log('🤖 AUTO-SELECT MODE: Automatically selecting all statements...');
    for (let i = 0; i < uniqueStatements.length; i++) {
      const stmt = uniqueStatements[i];
      
      // Determine which speed this statement targets based on its position
      const speedIndex = Math.floor(i / 2);
      const speeds = RUN_CONFIG.audioSpeeds;
      const targetSpeed = speeds[speedIndex];
      const statementNumber = (i % 2) + 1; // 1 or 2 for each speed
      
      // Determine which speed range this statement targets
      let speedRange = "";
      const targetChars = calculateTargetCharacters(targetSpeed, voiceAnalysis);
      
      if (stmt.characterCount >= targetChars.min && stmt.characterCount <= targetChars.max) {
        speedRange = `🎯 ${targetSpeed}x TARGET (Statement ${statementNumber})`;
      } else {
        speedRange = "⚠️  OUT OF RANGE";
      }
      
      console.log(`✅ Auto-selected ${i + 1}/${uniqueStatements.length}: ${speedRange}`);
      console.log(`   English: "${stmt.english}"`);
      console.log(`   Spanish: "${stmt.spanish}" (${stmt.characterCount} chars)`);
      
      userSelectedStatements.push(stmt);
    }
    console.log(`\n✅ Auto-selection complete: ${userSelectedStatements.length} statements selected`);
  } else {
    // Manual selection mode (original logic)
    for (let i = 0; i < uniqueStatements.length; i++) {
      const stmt = uniqueStatements[i];
      
      // Determine which speed this statement targets based on its position
      const speedIndex = Math.floor(i / 2);
      const speeds = RUN_CONFIG.audioSpeeds;
      const targetSpeed = speeds[speedIndex];
      const statementNumber = (i % 2) + 1; // 1 or 2 for each speed
      
      // Determine which speed range this statement targets
      let speedRange = "";
      const targetChars = calculateTargetCharacters(targetSpeed, voiceAnalysis);
      
      if (stmt.characterCount >= targetChars.min && stmt.characterCount <= targetChars.max) {
        speedRange = `🎯 ${targetSpeed}x TARGET (Statement ${statementNumber})`;
      } else {
        speedRange = "⚠️  OUT OF RANGE";
      }
      
      console.log(`\n${i + 1}/${uniqueStatements.length}: ${speedRange}`);
      console.log(`   English: "${stmt.english}"`);
      console.log(`   Spanish: "${stmt.spanish}" (${stmt.characterCount} chars)`);
      
      // Show which speeds this would work for
      const compatibleSpeeds = charSpeedsToUse.filter(speed => {
        const targetChars = calculateTargetCharacters(speed, voiceAnalysis);
        return stmt.characterCount >= targetChars.min && stmt.characterCount <= targetChars.max;
      });
      
      if (compatibleSpeeds.length > 0) {
        console.log(`   ✅ Compatible with speeds: ${compatibleSpeeds.join(', ')}x`);
      } else {
        console.log(`   ⚠️  Not compatible with any target speeds`);
      }
      
      console.log(`   Select? (ENTER/n): `);
      
      // Read user input
      const buffer = new Uint8Array(1024);
      const n = await Deno.stdin.read(buffer);
      if (n === null) {
        console.log('No input received, accepting...');
        userSelectedStatements.push(stmt);
      } else {
        const input = new TextDecoder().decode(buffer.subarray(0, n)).trim();
        console.log(`Input: "${input}"`);
        
        if (input.toLowerCase() === 'n' || input.toLowerCase() === 'no') {
          console.log('❌ Rejected');
        } else {
          console.log('✅ Accepted');
          userSelectedStatements.push(stmt);
        }
      }
    }
  }
  
  console.log(`\n✅ Selected ${userSelectedStatements.length} statements`);
  
  // Sort user-selected statements by Spanish character length (longest first)
  console.log(`\n📊 Sorting selected statements by Spanish character length...`);
  const sortedStatements = [...userSelectedStatements].sort((a, b) => b.characterCount - a.characterCount);
  
  console.log(`📋 Selected statements (sorted by length):`);
  sortedStatements.forEach((stmt, index) => {
    console.log(`   ${index + 1}. "${stmt.spanish}" (${stmt.characterCount} chars)`);
  });
  
  // Filter out statements that would be over 5 seconds for any speed
  console.log(`\n🔍 Filtering out statements over 5 seconds...`);
  const maxCharsFor5Seconds = Math.max(...charSpeedsToUse.map(speed => {
    const targetChars = calculateTargetCharacters(speed, voiceAnalysis);
    return targetChars.target * (5.0 / 4.5); // Scale up from 4.5s to 5s
  }));
  
  const filteredStatements = sortedStatements.filter(stmt => stmt.characterCount <= maxCharsFor5Seconds);
  console.log(`   Max chars for 5 seconds: ${Math.round(maxCharsFor5Seconds)}`);
  console.log(`   Statements after filtering: ${filteredStatements.length}/${sortedStatements.length}`);
  
  if (filteredStatements.length === 0) {
    throw new Error('No statements available after filtering for 5-second limit');
  }
  
  // Select the 4 statements closest to 4.5 seconds for each speed
  console.log(`\n🎯 Selecting 4 statements closest to 4.5 seconds for each speed...`);
  const audioSpeedsToUse = RUN_CONFIG.targetSpeed !== null 
    ? [RUN_CONFIG.targetSpeed] 
    : RUN_CONFIG.audioSpeeds;
  
  const allGeneratedAudios: Array<{
    statement: { english: string; spanish: string; characterCount: number };
    speed: number;
    filename: string;
    duration: number;
    wordCount: number;
    charactersPerSecond: number;
  }> = [];
  
  // For each speed, select the 4 statements closest to 4.5 seconds
  for (const speed of audioSpeedsToUse) {
    console.log(`\n📊 Speed ${speed}x: Selecting 4 statements closest to 4.5s...`);
    
    // Calculate estimated duration for each statement at this speed
    const speedData = voiceAnalysis.summary.speedAverages.find(s => s.speed === speed);
    if (!speedData) {
      console.log(`   ⚠️  No voice analysis data for speed ${speed}x, skipping`);
      continue;
    }
    
    const charsPerSecond = speedData.averageCharactersPerSecond;
    const targetDuration = 4.5; // Target 4.5 seconds
    
    // Calculate estimated duration for each statement and sort by closeness to 4.5s
    const statementsWithEstimatedDuration = filteredStatements.map(stmt => {
      const estimatedDuration = stmt.characterCount / charsPerSecond;
      const differenceFromTarget = Math.abs(estimatedDuration - targetDuration);
      return {
        ...stmt,
        estimatedDuration,
        differenceFromTarget
      };
    });
    
    // Sort by closeness to 4.5 seconds and take top 4
    const top4Statements = statementsWithEstimatedDuration
      .sort((a, b) => a.differenceFromTarget - b.differenceFromTarget)
      .slice(0, 4);
    
    console.log(`   Selected statements for ${speed}x:`);
    top4Statements.forEach((stmt, index) => {
      console.log(`   ${index + 1}. "${stmt.spanish}" (${stmt.characterCount} chars, est. ${stmt.estimatedDuration.toFixed(2)}s)`);
    });
    
    // Generate audio for these 4 statements at this speed
    for (const selectedStmt of top4Statements) {
      const filename = `s_${video.analysis.shortFilename || video.publicId}_speed${speed}_stmt${top4Statements.indexOf(selectedStmt) + 1}.mp3`;
      
      try {
        const audioResult = await generateAudio(selectedStmt.spanish, speed, filename);
        
        // Filter 2: Check if actual audio duration is too long
        if (isAudioTooLong(audioResult.duration)) {
          console.log(`   ⏭️  Skipping ${speed}x audio - actual duration ${audioResult.duration.toFixed(2)}s > 5.5s`);
          continue;
        }
        
        allGeneratedAudios.push({
          statement: selectedStmt,
          speed: speed,
          filename: filename,
          duration: audioResult.duration,
          wordCount: audioResult.wordCount,
          charactersPerSecond: audioResult.charactersPerSecond
        });
        
        console.log(`   ✅ ${speed}x: ${audioResult.duration.toFixed(3)}s, ${audioResult.charactersPerSecond.toFixed(2)} chars/sec`);
        
      } catch (error) {
        console.error(`   ❌ Error generating ${filename}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Now select the best audio for each speed based on speed-specific character rate
  console.log(`\n🎯 Selecting best audio for each speed based on speed-specific character rate...`);
  const finalAudioFiles: AudioFile[] = [];
  
  // Group audios by speed
  const audiosBySpeed = new Map<number, typeof allGeneratedAudios>();
  for (const audio of allGeneratedAudios) {
    if (!audiosBySpeed.has(audio.speed)) {
      audiosBySpeed.set(audio.speed, []);
    }
    audiosBySpeed.get(audio.speed)!.push(audio);
  }
  
  // For each speed, find the audio closest to that speed's average character rate
  for (const [speed, audios] of audiosBySpeed) {
    // Find the target character rate for this specific speed
    const speedAverage = voiceAnalysis.summary.speedAverages.find(avg => avg.speed === speed);
    if (!speedAverage) {
      console.log(`   ⚠️  No average found for speed ${speed}x, skipping`);
      continue;
    }
    
    const targetCharacterRate = speedAverage.averageCharactersPerSecond;
    console.log(`\n📊 Speed ${speed}x: Target character rate: ${targetCharacterRate} chars/sec`);
    
    // Find the audio closest to the target character rate for this speed
    let bestAudio = audios[0];
    let bestDifference = Math.abs(audios[0].charactersPerSecond - targetCharacterRate);
    
    for (const audio of audios) {
      const difference = Math.abs(audio.charactersPerSecond - targetCharacterRate);
      console.log(`   Statement: "${audio.statement.spanish}"`);
      console.log(`   ${audio.charactersPerSecond.toFixed(2)} chars/sec (diff: ${difference.toFixed(2)})`);
      
      if (difference < bestDifference) {
        bestDifference = difference;
        bestAudio = audio;
      }
    }
    
    console.log(`   ✅ Selected: "${bestAudio.statement.spanish}"`);
    console.log(`   ${bestAudio.charactersPerSecond.toFixed(2)} chars/sec (closest to ${speed}x target)`);
    
    const audioFile: AudioFile = {
      statementId: finalAudioFiles.length + 1,
      speed: bestAudio.speed,
      filename: bestAudio.filename,
      duration: bestAudio.duration,
      wordCount: bestAudio.wordCount,
      transcript: bestAudio.statement.spanish,
      answer: videoTargetAnswer || false,
      translation: bestAudio.statement.english,
      charactersPerSecond: bestAudio.charactersPerSecond
    };
    
    finalAudioFiles.push(audioFile);
  }
  
  // Copy selected audio files to main audio folder without "stmt" prefix
  console.log(`\n📁 Copying selected audio files to main audio folder...`);
  for (const audioFile of finalAudioFiles) {
    const sourcePath = `audio/statements/${audioFile.filename}`;
    const destFilename = audioFile.filename.replace(/_stmt\d+\.mp3$/, '.mp3');
    const destPath = `audio/${destFilename}`;
    
    try {
      // Copy the file
      const audioData = await Deno.readFile(sourcePath);
      await Deno.writeFile(destPath, audioData);
      
      // Update the filename in the audioFile object
      audioFile.filename = destFilename;
      
      console.log(`   ✅ Copied: ${audioFile.filename} (${audioFile.speed}x)`);
    } catch (error) {
      console.error(`   ❌ Error copying ${audioFile.filename}:`, error.message);
    }
  }
  
  // Final summary
  console.log(`\n📊 Final Summary:`);
  console.log(`   Total statements generated: ${allStatements.length}`);
  console.log(`   Duplicates removed: ${allStatements.length - uniqueStatements.length}`);
  console.log(`   Unique statements available: ${uniqueStatements.length}`);
  console.log(`   Statements after 5s filtering: ${filteredStatements.length}`);
  console.log(`   Audio files generated: ${finalAudioFiles.length}`);
  
  finalAudioFiles.forEach(audio => {
    console.log(`   ${audio.speed}x: "${audio.translation}" → "${audio.transcript}" (${audio.duration.toFixed(1)}s)`);
  });
  
  // Create result object
  const result: StatementAudioResult = {
    cloudinaryUrl: video.cloudinaryUrl,
    publicId: video.publicId,
    audioFiles: finalAudioFiles,
    timestamp: new Date().toISOString()
  };
  
  // Final detailed summary of what's being saved
  console.log(`\n📋 JSON File Contents Summary:`);
  console.log(`   📁 File: ${language}-s-${video.analysis.shortFilename || video.publicId}.json`);
  console.log(`   🎬 Video: ${video.publicId}`);
  console.log(`   🎵 Audio Files: ${finalAudioFiles.length}`);
  console.log(`   📅 Timestamp: ${result.timestamp}`);
  
  finalAudioFiles.forEach((audio, index) => {
    console.log(`\n   📄 Audio File ${index + 1}:`);
    console.log(`      🆔 Statement ID: ${audio.statementId}`);
    console.log(`      ⚡ Speed: ${audio.speed}x`);
    console.log(`      📁 Filename: ${audio.filename}`);
    console.log(`      ⏱️  Duration: ${audio.duration.toFixed(3)}s`);
    console.log(`      📊 Word Count: ${audio.wordCount}`);
    console.log(`      📝 Transcript: "${audio.transcript}"`);
    console.log(`      ✅ Answer: ${audio.answer ? 'TRUE' : 'FALSE'}`);
    console.log(`      🌐 Translation: "${audio.translation}"`);
  });
  
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

// Generate Spanish translation of English statement
async function generateSpanishTranslation(englishStatement: string): Promise<string> {
  try {
    console.log(`🌐 Generating Spanish translation...`);
    
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env');
    }
    
    const prompt = `Translate this English statement to Spanish. Use simple, clear Spanish that would be appropriate for A1-A2 level language learners. Return ONLY the Spanish translation, nothing else.

English: "${englishStatement}"

Spanish translation:`;

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
    
    console.log(`   Spanish: "${translation}"`);
    return translation;

  } catch (error) {
    console.error('❌ Error generating Spanish translation:', error);
    throw error;
  }
}

// Terminal selection functions
async function selectStatements(statements: StatementCandidate[]): Promise<StatementCandidate[]> {
  // Check if auto-select is enabled
  if (RUN_CONFIG.autoSelectAllStatements) {
    console.log('\n📋 Statement Selection: AUTO-SELECT MODE');
    console.log('✅ Automatically selecting all statements...');
    
    const selectedStatements: StatementCandidate[] = [];
    
    for (const stmt of statements) {
      stmt.selected = true;
      selectedStatements.push(stmt);
      console.log(`✅ Auto-selected: [${stmt.answer ? 'TRUE' : 'FALSE'}] ${stmt.statement}`);
    }
    
    console.log(`\n✅ Auto-selection complete: ${selectedStatements.length} statements selected`);
    return selectedStatements;
  }
  
  // Manual selection mode (original logic)
  console.log('\n📋 Statement Selection:');
  console.log('For each statement, press:');
  console.log('  ENTER = YES (select this statement)');
  console.log('  n = NO (skip this statement)');
  console.log('  a = ALL (select all remaining statements)');
  console.log('  s = SKIP ALL (skip all remaining statements)');
  console.log('');
  
  const selectedStatements: StatementCandidate[] = [];
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`\n${i + 1}/${statements.length}: [${stmt.answer ? 'TRUE' : 'FALSE'}] ${stmt.statement}`);
    console.log('Select? (ENTER/n/a/s): ');
    
    // Read user input from stdin
    const buffer = new Uint8Array(1024);
    const n = await Deno.stdin.read(buffer);
    if (n === null) {
      console.log('No input received, skipping...');
      continue;
    }
    
    const input = new TextDecoder().decode(buffer.subarray(0, n)).trim();
    console.log(`Input: "${input}"`);
    
    if (input === '' || input === '\n' || input === '\r') {
      // Just ENTER - YES
      stmt.selected = true;
      selectedStatements.push(stmt);
      console.log('✅ Selected (ENTER)');
    } else if (input.toLowerCase() === 'n' || input.toLowerCase() === 'no') {
      // n - NO
      stmt.selected = false;
      console.log('❌ Skipped (n)');
    } else if (input.toLowerCase() === 'a' || input.toLowerCase() === 'all') {
      // Select all remaining statements
      for (let j = i; j < statements.length; j++) {
        statements[j].selected = true;
        selectedStatements.push(statements[j]);
      }
      console.log(`✅ Selected all remaining statements (${statements.length - i})`);
      break;
    } else if (input.toLowerCase() === 's' || input.toLowerCase() === 'skip') {
      // Skip all remaining statements
      console.log(`❌ Skipped all remaining statements (${statements.length - i})`);
      break;
    } else {
      // Any other input - treat as NO
      stmt.selected = false;
      console.log('❌ Skipped (other key)');
    }
  }
  
  console.log(`\n✅ Selection complete: ${selectedStatements.length} statements selected`);
  return selectedStatements;
}

// Function to review automatically selected audio files
async function reviewSelectedAudioFiles(audioCandidates: AudioCandidate[]): Promise<AudioCandidate[]> {
  // Check if auto-select is enabled
  if (RUN_CONFIG.autoSelectAllAudio) {
    console.log('\n🎵 Audio Review: AUTO-SELECT MODE');
    console.log('✅ Automatically selecting all audio files...');
    
    const selected: AudioCandidate[] = [];
    
    // Group by speed
    const groupedBySpeed = new Map<number, AudioCandidate[]>();
    audioCandidates.forEach(audio => {
      if (!groupedBySpeed.has(audio.speed)) {
        groupedBySpeed.set(audio.speed, []);
      }
      groupedBySpeed.get(audio.speed)!.push(audio);
    });
    
    for (const [speed, audios] of groupedBySpeed) {
      if (audios.length === 0) continue;
      
      // Take the first audio for this speed (automatically selected)
      const audio = audios[0];
      audio.selected = true;
      selected.push(audio);
      
      console.log(`✅ Auto-selected for ${speed}x: "${audio.statement}" (${audio.duration.toFixed(1)}s)`);
    }
    
    console.log(`\n✅ Auto-selection complete: ${selected.length} audio files selected`);
    return selected;
  }
  
  // Manual review mode (original logic)
  console.log('\n🎵 Audio Review:');
  console.log('Reviewing automatically selected audio files for each speed.');
  console.log('  ENTER = YES (keep this audio)');
  console.log('  n = NO (skip this audio, no replacement)');
  console.log('  r = REPLAY (hear this audio again)');
  console.log('');
  
  // Group by speed
  const groupedBySpeed = new Map<number, AudioCandidate[]>();
  audioCandidates.forEach(audio => {
    if (!groupedBySpeed.has(audio.speed)) {
      groupedBySpeed.set(audio.speed, []);
    }
    groupedBySpeed.get(audio.speed)!.push(audio);
  });
  
  const selected: AudioCandidate[] = [];
  
  for (const [speed, audios] of groupedBySpeed) {
    if (audios.length === 0) continue;
    
    // Take the first audio for this speed (automatically selected)
    const audio = audios[0];
    
    console.log(`\n🎯 Speed ${speed}x - Reviewing selected audio:`);
    console.log(`   English: "${audio.translation}"`);
    console.log(`   Spanish: "${audio.statement}"`);
    console.log(`   Duration: ${audio.duration.toFixed(1)}s`);
    
    // Play the audio file
    try {
      console.log(`   🔊 Playing audio...`);
      await playAudioFile(audio.filename);
      console.log(`   ✅ Audio played successfully`);
    } catch (error) {
      console.log(`   ⚠️  Could not play audio: ${error.message}`);
    }
    
    console.log(`\n   Keep this audio? (ENTER/n/r): `);
    
    // Read user input
    const buffer = new Uint8Array(1024);
    const n = await Deno.stdin.read(buffer);
    if (n === null) {
      console.log('No input received, keeping audio...');
      audio.selected = true;
      selected.push(audio);
      continue;
    }
    
    const input = new TextDecoder().decode(buffer.subarray(0, n)).trim();
    console.log(`   Input: "${input}"`);
    
    if (input === '' || input === '\n' || input === '\r') {
      // ENTER - YES, keep this audio
      audio.selected = true;
      selected.push(audio);
      console.log(`   ✅ Kept for ${speed}x: "${audio.statement}"`);
    } else if (input.toLowerCase() === 'n' || input.toLowerCase() === 'no') {
      // n - NO, skip this audio
      audio.selected = false;
      console.log(`   ❌ Skipped for ${speed}x`);
    } else if (input.toLowerCase() === 'r' || input.toLowerCase() === 'replay') {
      // r - REPLAY, hear this audio again
      console.log(`   🔄 Replaying audio...`);
      try {
        await playAudioFile(audio.filename);
        console.log(`   ✅ Audio replayed successfully`);
      } catch (error) {
        console.log(`   ⚠️  Could not replay audio: ${error.message}`);
      }
      // Go back to the same audio
      console.log(`\n   Keep this audio? (ENTER/n/r): `);
      continue;
    } else {
      // Any other input - treat as YES
      audio.selected = true;
      selected.push(audio);
      console.log(`   ✅ Kept for ${speed}x: "${audio.statement}"`);
    }
  }
  
  console.log(`\n✅ Audio review complete: ${selected.length} audio files kept`);
  console.log('Kept audio files by speed:');
  selected.forEach(audio => {
    console.log(`  ${audio.speed}x: "${audio.statement}" (${audio.duration.toFixed(1)}s)`);
  });
  
  return selected;
}

// Function to play audio file through terminal
async function playAudioFile(filename: string): Promise<void> {
  try {
    // Check if the audio file exists
    const audioPath = `./audio/${filename}`;
    try {
      await Deno.stat(audioPath);
    } catch {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
    
    // Use afplay on macOS to play the audio
    const process = Deno.run({
      cmd: ['afplay', audioPath],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    // Wait for the audio to finish playing
    const status = await process.status();
    
    if (!status.success) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      throw new Error(`Audio playback failed: ${errorOutput}`);
    }
    
  } catch (error) {
    throw new Error(`Could not play audio: ${error.message}`);
  }
}

// Remove exact English and Spanish duplicates from statements
function removeDuplicateStatements(statements: Array<{ english: string; spanish: string; characterCount: number }>): Array<{ english: string; spanish: string; characterCount: number }> {
  const seenEnglish = new Set<string>();
  const seenSpanish = new Set<string>();
  const uniqueStatements: Array<{ english: string; spanish: string; characterCount: number }> = [];
  
  for (const statement of statements) {
    const normalizedEnglish = statement.english.toLowerCase().trim();
    const normalizedSpanish = statement.spanish.toLowerCase().trim();
    
    // Check if either English or Spanish is a duplicate
    if (!seenEnglish.has(normalizedEnglish) && !seenSpanish.has(normalizedSpanish)) {
      seenEnglish.add(normalizedEnglish);
      seenSpanish.add(normalizedSpanish);
      uniqueStatements.push(statement);
    } else {
      if (seenEnglish.has(normalizedEnglish)) {
        console.log(`   ⚠️  Removed English duplicate: "${statement.english}"`);
      } else {
        console.log(`   ⚠️  Removed Spanish duplicate: "${statement.spanish}"`);
      }
    }
  }
  
  console.log(`   📊 Removed ${statements.length - uniqueStatements.length} duplicates (English + Spanish)`);
  return uniqueStatements;
}

// Main function
async function main() {
  try {
    const language = RUN_CONFIG.language;
    const langConfig = languageConfigs[language];
    
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
    
    console.log('🌍 Bulk Question Generator');
    console.log(`🎯 Language: ${language} statements → ${language} audio (${langConfig.code})`);
    console.log('');
    console.log(`🤖 Using OpenAI API`);
    console.log(`🎵 Using ElevenLabs API`);
    console.log(`🔑 OpenAI Key: ${config.OPENAI_API_KEY.substring(0, 7)}...`);
    console.log(`🔑 ElevenLabs Key: ${config.ELEVENLABS_API_KEY.substring(0, 7)}...`);
    console.log(`🔊 Audio Generation: ${RUN_CONFIG.skipAudio ? 'SKIPPED' : 'ENABLED'}`);
    console.log(`📝 Statements to generate: ${RUN_CONFIG.statementsToGenerate}`);
    console.log(`🤖 Auto-select statements: ${RUN_CONFIG.autoSelectAllStatements ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🎵 Auto-select audio: ${RUN_CONFIG.autoSelectAllAudio ? 'ENABLED' : 'DISABLED'}`);
    if (RUN_CONFIG.targetSpeed !== null) {
      console.log(`🎵 Target Speed: ${RUN_CONFIG.targetSpeed}x (single speed)`);
    } else {
      console.log(`🎵 Audio speeds: ${RUN_CONFIG.audioSpeeds.join(', ')}x`);
    }
    if (RUN_CONFIG.targetVideoId) {
      console.log(`🎬 Target Video: ${RUN_CONFIG.targetVideoId}`);
    }
    if (RUN_CONFIG.targetAnswer !== null) {
      console.log(`✅ Target Answer: ${RUN_CONFIG.targetAnswer ? 'TRUE' : 'FALSE'} (from config, will be overridden by analysis file if available)`);
    } else {
      console.log(`✅ Target Answer: RANDOM (will use analysis file targetAnswer if available)`);
    }
    console.log('');
    
    // Load video analysis
    const videos = await loadVideoAnalysis();
    
    if (videos.length === 0) {
      console.log('📭 No video analyses found');
      return;
    }
    
    // Load voice analysis
    const voiceAnalysis = await loadVoiceAnalysis();
    
    // Process only the configured number of videos
    let videosToProcess: VideoAnalysisResult[];
    
    if (RUN_CONFIG.targetVideoId) {
      // Filter by specific video ID
      const targetVideo = videos.find(video => 
        video.publicId === RUN_CONFIG.targetVideoId || 
        video.analysis.shortFilename === RUN_CONFIG.targetVideoId
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
    
    // Check for cutoff timestamp
    if (RUN_CONFIG.cutoffTimestamp) {
      console.log(`⏰ Cutoff timestamp: ${RUN_CONFIG.cutoffTimestamp}`);
      console.log(`🔄 Will skip videos with more recent Spanish JSON files`);
    }
    
    console.log('');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < videosToProcess.length; i++) {
      const video = videosToProcess[i];
      const shortFilename = video.analysis.shortFilename || video.publicId;
      console.log(`📹 Processing video ${i + 1}/${videosToProcess.length}: ${shortFilename}\n`);
      
      // Check if we should skip this video based on cutoff timestamp
      const skipCheck = await shouldSkipVideo(shortFilename, RUN_CONFIG.cutoffTimestamp);
      if (skipCheck.skip) {
        console.log(`⏭️  Skipping ${shortFilename}: ${skipCheck.reason}`);
        continue;
      }
      
      try {
        const result = await processVideo(video, language, voiceAnalysis);
        
        // Save result - use the shortFilename for consistent naming
        const resultFile = `./json/${language}-s-${shortFilename}.json`;
        
        // Update timestamp before saving
        result.timestamp = new Date().toISOString();
        
        await Deno.writeTextFile(resultFile, JSON.stringify(result, null, 2));
        console.log(`\n💾 Results saved to: ${resultFile}`);
        console.log(`🕒 Updated timestamp: ${result.timestamp}`);
        
        // Summary
        console.log(`\n📊 Summary:`);
        console.log(`   Video: ${shortFilename}`);
        console.log(`   Language: ${langConfig.name} (${langConfig.code})`);
        console.log(`   Statements generated: ${RUN_CONFIG.statementsToGenerate}`);
        console.log(`   Audio files generated: ${result.audioFiles.length}`);
        console.log(`   Winning audio files: ${result.audioFiles.length}`);
        if (RUN_CONFIG.skipAudio) {
          console.log(`   Audio Generation: SKIPPED`);
        }
        
        successCount++;
        
      } catch (error) {
        console.error(`❌ Failed to process video ${shortFilename}:`, error.message);
        errorCount++;
      }
      
      // Add a small delay between videos to avoid rate limiting
      if (i < videosToProcess.length - 1) {
        console.log(`\n⏳ Waiting 2 seconds before next video...\n`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n🏁 Final Summary:`);
    console.log(`   Total videos processed: ${videosToProcess.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${errorCount}`);
    console.log(`\n✅ ${langConfig.name} audio generation completed!`);
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run if this is the main module
// @ts-ignore
if (import.meta.main) {
  main();
}