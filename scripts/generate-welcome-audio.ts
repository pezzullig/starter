#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run

// Welcome Audio Generator
// Generates ElevenLabs voice audio for a welcome statement at multiple speeds

import { loadEnvConfig } from './env-loader.ts';

interface ElevenLabsResponse {
  audio: string; // base64 audio data
  message?: string;
}

const WELCOME_STATEMENT = "Hola. Bienvenido a Habbly. Habbly es el nombre de mi aplicación. Voy a hablar ahora para ver si puedes entenderme. Por favor, elige una velocidad que te resulte cómoda. Se prueba tu capacidad para escuchar español a diferentes velocidades. Uso gramática y vocabulario simples, con palabras entre las mil más comunes. Al principio hablo lento, luego hablo un poco más rápido y al final hablo a velocidad normal. Escucha con atención y trata de comprender cada palabra. Repite si no comprendes. Esta prueba ayuda a adaptar el estudio a tu nivel y mejora tu aprendizaje. Gracias por participar y disfruta la experiencia";

const SPEEDS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

// Generate audio using ElevenLabs API
async function generateAudio(text: string, speed: number, filename: string): Promise<{ duration: number; wordCount: number; charactersPerSecond: number }> {
  try {
    console.log(`🎵 Generating audio for speed ${speed}x: ${filename}`);
    
    const config = await loadEnvConfig();
    
    if (!config.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not set in config.env');
    }
    
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
    
    // Create welcome subfolder if it doesn't exist
    try {
      await Deno.mkdir('audio/welcome', { recursive: true });
    } catch {
      // Folder already exists, ignore
    }
    
    // Save audio file in welcome subfolder
    await Deno.writeFile(`audio/welcome/${filename}`, audioData);
    
    // Get exact duration using afinfo
    const duration = await getAudioDuration(`audio/welcome/${filename}`);
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

// Get audio duration using macOS afinfo command
async function getAudioDuration(audioFilePath: string): Promise<number> {
  try {
    const command = new Deno.Command('afinfo', {
      args: [audioFilePath],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const { stdout, stderr } = await command.output();
    
    if (stderr.length > 0) {
      console.warn(`⚠️  afinfo stderr: ${new TextDecoder().decode(stderr)}`);
    }
    
    const output = new TextDecoder().decode(stdout);
    
    // Parse duration from afinfo output
    const durationMatch = output.match(/duration: (\d+\.\d+) seconds/);
    if (durationMatch) {
      return parseFloat(durationMatch[1]);
    }
    
    throw new Error('Could not parse duration from afinfo output');
    
  } catch (error) {
    console.error(`❌ Error getting audio duration:`, error.message);
    throw error;
  }
}

// Check if audio file already exists
async function audioFileExists(filename: string): Promise<boolean> {
  try {
    await Deno.stat(`audio/welcome/${filename}`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🎤 Welcome Audio Generator');
  console.log('🎵 Generating ElevenLabs voice audio for welcome statement');
  console.log(`📝 Statement: "${WELCOME_STATEMENT.substring(0, 100)}..."`);
  console.log(`🎯 Speeds: ${SPEEDS.join(', ')}x\n`);
  
  const config = await loadEnvConfig();
  
  if (!config.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set in config.env');
  }
  
  console.log(`🎵 Using ElevenLabs API`);
  console.log(`🔑 ElevenLabs Key: ${config.ELEVENLABS_API_KEY.substring(0, 7)}...`);
  console.log(`🎭 Voice ID: ${config.ELEVENLABS_VOICE_ID || 'Default'}\n`);
  
  const results: Array<{ speed: number; filename: string; duration: number; wordCount: number; charactersPerSecond: number }> = [];
  
  // Process all speeds
  for (const speed of SPEEDS) {
    const filename = `welcome_speed${speed}.mp3`;
    
    // Check if file already exists
    if (await audioFileExists(filename)) {
      console.log(`⏭️  Skipping ${filename} (already exists)`);
      continue;
    }
    
    try {
      const result = await generateAudio(WELCOME_STATEMENT, speed, filename);
      results.push({
        speed,
        filename,
        ...result
      });
    } catch (error) {
      console.error(`❌ Failed to generate audio for speed ${speed}x:`, error.message);
    }
  }
  
  // Summary
  console.log('\n📊 Generation Summary:');
  console.log(`✅ Generated ${results.length} audio files`);
  
  if (results.length > 0) {
    console.log('\n📋 Generated Files:');
    results.forEach(result => {
      console.log(`   ${result.filename}: ${result.duration.toFixed(3)}s, ${result.wordCount} words, ${result.charactersPerSecond.toFixed(2)} chars/sec`);
    });
    
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const avgCharsPerSec = results.reduce((sum, r) => sum + r.charactersPerSecond, 0) / results.length;
    
    console.log(`\n📈 Averages:`);
    console.log(`   Duration: ${avgDuration.toFixed(3)}s`);
    console.log(`   Characters per second: ${avgCharsPerSec.toFixed(2)}`);
  }
  
  console.log('\n🎉 Welcome audio generation complete!');
  console.log('📁 Files saved in: audio/welcome/');
}

// Run the script
if (import.meta.main) {
  main().catch(console.error);
} 