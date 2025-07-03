/// <reference types="https://deno.land/x/deno@v1.40.4/lib/deno.ns.d.ts" />

// Voice Analyzer Script
// Analyzes syllables per second for a voice ID across different speeds
// Run with: deno run --allow-net --allow-read --allow-write --allow-env scripts/voice-analyzer.ts

// @ts-ignore
declare const Deno: any;

import { loadEnvConfig, type Config } from './env-loader.ts';

interface VoiceAnalysisResult {
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
  speeds: SpeedAnalysis[];
  timestamp: string;
}

interface SpeedAnalysis {
  speed: number;
  statements: StatementAnalysis[];
  averageCharactersPerSecond: number;
  averageDuration: number;
}

interface StatementAnalysis {
  id: number;
  spanishText: string;
  wordCount: number;
  characterCount: number;
  duration: number;
  charactersPerSecond: number;
  filename: string;
}

// Global config variable
let config: Config;

// Configuration for this run
const RUN_CONFIG = {
  voiceId: "21m00Tcm4TlvDq8ikWAM", // Default voice ID - change this as needed
  speeds: [0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
  statementsPerSpeed: 10,
  minWords: 10,
  maxWords: 30,
  outputFolder: "voice"
};

// Generate Spanish statements using OpenAI
async function generateSpanishStatements(count: number, minWords: number, maxWords: number): Promise<string[]> {
  try {
    console.log(`🤖 Generating ${count} Spanish statements...`);
    
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in config.env');
    }
    
    const statements: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const wordCount = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords;
      
      const prompt = `Generate a simple, natural Spanish statement with exactly ${wordCount} words. 
The statement should be appropriate for A1-A2 level language learners.
Use common vocabulary and simple grammar structures.
Return ONLY the Spanish statement, nothing else.

Spanish statement:`;

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
          temperature: 0.7,
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const statement = data.choices[0].message.content.trim();
      
      statements.push(statement);
      console.log(`   ✅ Statement ${i + 1}: "${statement}" (${wordCount} words)`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return statements;
    
  } catch (error) {
    console.error('❌ Error generating Spanish statements:', error);
    throw error;
  }
}

// Generate audio using ElevenLabs API
async function generateAudio(text: string, speed: number, filename: string): Promise<number> {
  try {
    console.log(`🎵 Generating audio for speed ${speed}x: ${filename}`);
    
    if (!config.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not set in config.env');
    }
    
    // Calculate stability and similarity boost based on speed
    const stability = Math.max(0.3, 0.8 - (speed - 0.7) * 0.2);
    const similarityBoost = Math.max(0.5, 0.8 - (speed - 0.7) * 0.15);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${RUN_CONFIG.voiceId}`, {
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
    await Deno.writeFile(filename, audioData);
    
    // Calculate actual duration from file size and bitrate
    const fileSizeBytes = audioData.length;
    const bitrate = 128000; // 128 kbps as specified in output_format
    const actualDuration = (fileSizeBytes * 8) / bitrate;
    
    console.log(`✅ Audio generated: ${filename} (${actualDuration.toFixed(1)}s)`);
    
    return actualDuration;
    
  } catch (error) {
    console.error(`❌ Error generating audio:`, error.message);
    throw error;
  }
}

// Analyze voice characteristics
async function analyzeVoice(): Promise<VoiceAnalysisResult> {
  console.log(`🎤 Analyzing voice: ${RUN_CONFIG.voiceId}`);
  
  // Create output directory
  const voiceDir = `${RUN_CONFIG.outputFolder}/${RUN_CONFIG.voiceId}`;
  try {
    await Deno.mkdir(voiceDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  
  // Generate Spanish statements
  const totalStatements = RUN_CONFIG.speeds.length * RUN_CONFIG.statementsPerSpeed;
  const spanishStatements = await generateSpanishStatements(totalStatements, RUN_CONFIG.minWords, RUN_CONFIG.maxWords);
  
  const speeds: SpeedAnalysis[] = [];
  let statementIndex = 0;
  
  for (const speed of RUN_CONFIG.speeds) {
    console.log(`\n🎯 Analyzing speed ${speed}x...`);
    
    const statements: StatementAnalysis[] = [];
    
    for (let i = 0; i < RUN_CONFIG.statementsPerSpeed; i++) {
      const statement = spanishStatements[statementIndex];
      const characterCount = statement.length;
      
      const filename = `${voiceDir}/speed${speed}_stmt${i + 1}.mp3`;
      
      try {
        const duration = await generateAudio(statement, speed, filename);
        const charactersPerSecond = characterCount / duration;
        
        statements.push({
          id: i + 1,
          spanishText: statement,
          wordCount: statement.split(/\s+/).length,
          characterCount,
          duration,
          charactersPerSecond,
          filename
        });
        
        console.log(`   ✅ Statement ${i + 1}: ${characterCount} characters, ${duration.toFixed(1)}s, ${charactersPerSecond.toFixed(1)} characters/s`);
        
      } catch (error) {
        console.error(`   ❌ Error with statement ${i + 1}:`, error.message);
      }
      
      statementIndex++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Calculate averages for this speed
    const validStatements = statements.filter(s => s.duration > 0);
    const averageCharactersPerSecond = validStatements.length > 0 
      ? validStatements.reduce((sum, s) => sum + s.charactersPerSecond, 0) / validStatements.length
      : 0;
    const averageDuration = validStatements.length > 0
      ? validStatements.reduce((sum, s) => sum + s.duration, 0) / validStatements.length
      : 0;
    
    speeds.push({
      speed,
      statements,
      averageCharactersPerSecond,
      averageDuration
    });
    
    console.log(`   📊 Speed ${speed}x average: ${averageCharactersPerSecond.toFixed(1)} characters/s, ${averageDuration.toFixed(1)}s duration`);
  }
  
  // Calculate overall average
  const validSpeeds = speeds.filter(s => s.averageCharactersPerSecond > 0);
  const overallAverage = validSpeeds.length > 0
    ? validSpeeds.reduce((sum, s) => sum + s.averageCharactersPerSecond, 0) / validSpeeds.length
    : 0;
  
  const result: VoiceAnalysisResult = {
    voiceId: RUN_CONFIG.voiceId,
    summary: {
      overallAverageCharactersPerSecond: overallAverage,
      speedAverages: speeds.map(s => ({
        speed: s.speed,
        averageCharactersPerSecond: s.averageCharactersPerSecond,
        averageDuration: s.averageDuration,
        statementCount: s.statements.length
      }))
    },
    speeds,
    timestamp: new Date().toISOString()
  };
  
  return result;
}

// Main function
async function main() {
  try {
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
    
    console.log('🎤 Voice Analyzer');
    console.log(`🎯 Voice ID: ${RUN_CONFIG.voiceId}`);
    console.log(`🎵 Speeds: ${RUN_CONFIG.speeds.join(', ')}x`);
    console.log(`📝 Statements per speed: ${RUN_CONFIG.statementsPerSpeed}`);
    console.log(`📁 Output folder: ${RUN_CONFIG.outputFolder}/${RUN_CONFIG.voiceId}`);
    console.log('');
    console.log(`🤖 Using OpenAI API`);
    console.log(`🎵 Using ElevenLabs API`);
    console.log(`🔑 OpenAI Key: ${config.OPENAI_API_KEY.substring(0, 7)}...`);
    console.log(`🔑 ElevenLabs Key: ${config.ELEVENLABS_API_KEY.substring(0, 7)}...`);
    console.log('');
    
    // Analyze voice
    const result = await analyzeVoice();
    
    // Save results
    const resultFile = `${RUN_CONFIG.outputFolder}/${RUN_CONFIG.voiceId}/analysis.json`;
    await Deno.writeTextFile(resultFile, JSON.stringify(result, null, 2));
    
    // Print summary
    console.log(`\n📊 Analysis Complete!`);
    console.log(`💾 Results saved to: ${resultFile}`);
    console.log(`\n🎯 Overall average characters per second: ${result.summary.overallAverageCharactersPerSecond.toFixed(1)}`);
    console.log(`\n📈 Breakdown by speed:`);
    
    for (const speedAvg of result.summary.speedAverages) {
      console.log(`   ${speedAvg.speed}x: ${speedAvg.averageCharactersPerSecond.toFixed(1)} characters/s (${speedAvg.averageDuration.toFixed(1)}s avg duration)`);
    }
    
    console.log(`\n✅ Voice analysis completed!`);
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run if this is the main module
// @ts-ignore
if (import.meta.main) {
  main();
}