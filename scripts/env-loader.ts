// Environment Loader Utility
// Loads environment variables from config.env file

interface Config {
  OPENAI_API_KEY: string;
  VIDEO_ANALYSIS_FOLDER: string;
  MAX_FRAME_COUNT: number;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CREATORMATE_API_KEY?: string;
  CREATORMATE_API_URL?: string;
}

// Load environment variables from config.env file
async function loadEnvConfig(): Promise<Config> {
  try {
    const configPath = './config.env';
    const configContent = await Deno.readTextFile(configPath);
    
    const config: Partial<Config> = {};
    
    // Parse the config file line by line
    const lines = configContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        continue;
      }
      
      // Parse key=value pairs
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();
        
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        
        // Convert to appropriate type
        if (key === 'MAX_FRAME_COUNT') {
          config[key] = parseInt(cleanValue, 10);
        } else {
          config[key] = cleanValue;
        }
      }
    }
    
    // Validate required fields
    if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'sk-your-api-key-here') {
      throw new Error('OPENAI_API_KEY not set in config.env. Please add your OpenAI API key.');
    }
    
    return {
      OPENAI_API_KEY: config.OPENAI_API_KEY!,
      VIDEO_ANALYSIS_FOLDER: config.VIDEO_ANALYSIS_FOLDER || './media',
      MAX_FRAME_COUNT: config.MAX_FRAME_COUNT || 3,
      ELEVENLABS_API_KEY: config.ELEVENLABS_API_KEY,
      ELEVENLABS_VOICE_ID: config.ELEVENLABS_VOICE_ID,
      CLOUDINARY_CLOUD_NAME: config.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: config.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: config.CLOUDINARY_API_SECRET,
      CREATORMATE_API_KEY: config.CREATORMATE_API_KEY,
      CREATORMATE_API_URL: config.CREATORMATE_API_URL
    };
    
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error('config.env file not found. Please create it with your OpenAI API key.');
    }
    throw error;
  }
}

// Export the loader function
export { loadEnvConfig };
export type { Config }; 