// Cloudinary Video Downloader Script
// Downloads videos from Cloudinary using the provided links
// Run with: deno run --allow-net --allow-read --allow-write scripts/cloudinary-video-downloader.ts

import { loadEnvConfig, type Config } from './env-loader.ts';

interface CloudinaryVideo {
  publicId: string;
  originalUrl: string;
  downloadUrl: string;
}

interface DownloadOptions {
  folder?: string;
  format?: 'mp4' | 'webm' | 'mov';
  quality?: number;
  width?: number;
  height?: number;
}

// Global config variable
let config: Config;

// Extract public ID from Cloudinary embed URL
function extractPublicId(url: string): string {
  const match = url.match(/public_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// Build Cloudinary video download URL
function buildVideoDownloadUrl(publicId: string, options: DownloadOptions = {}): string {
  const {
    format = 'mp4',
    quality = 80,
    width,
    height
  } = options;
  
  let url = `https://res.cloudinary.com/dtszsqfxo/video/upload`;
  
  // Add transformations
  const transformations: string[] = [];
  
  if (width || height) {
    const size = width && height ? `${width}x${height}` : width ? `${width}` : `${height}`;
    transformations.push(`w_${size}`);
  }
  
  transformations.push(`q_${quality}`, `f_${format}`);
  
  if (transformations.length > 0) {
    url += `/${transformations.join(',')}`;
  }
  
  url += `/${publicId}.${format}`;
  
  return url;
}

// Utility function for downloading files
async function downloadFile(url: string, filepath: string): Promise<void> {
  try {
    console.log(`📥 Downloading: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.arrayBuffer();
    await Deno.writeFile(filepath, new Uint8Array(data));
    console.log(`✅ Downloaded: ${filepath}`);
    
  } catch (error) {
    console.error(`❌ Error downloading ${url}:`, error.message);
    throw error;
  }
}

// Download videos from Cloudinary
async function downloadCloudinaryVideos(videos: CloudinaryVideo[], options: DownloadOptions = {}): Promise<void> {
  try {
    console.log(`🚀 Starting Cloudinary video download for ${videos.length} videos...`);
    
    // Create download directory
    const downloadDir = options.folder || './cloudinary-videos';
    try {
      await Deno.mkdir(downloadDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Download each video
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`\n🎬 Processing video ${i + 1}/${videos.length}: ${video.publicId}`);
      
      try {
        // Create filename
        const safePublicId = video.publicId.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${downloadDir}/${safePublicId}.${options.format || 'mp4'}`;
        
        // Download the video
        await downloadFile(video.downloadUrl, filename);
        
        // Add a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Failed to download ${video.publicId}:`, error.message);
      }
    }
    
    console.log(`\n✅ Cloudinary video download completed!`);
    
  } catch (error) {
    console.error('💥 Download failed:', error.message);
  }
}

// Your Cloudinary videos
const cloudinaryVideos: CloudinaryVideo[] = [
  {
    publicId: 'The_ultimate_way_to_eat_a_banana_gorilla_eating_asmr_satisfying_gbbmk9',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=The_ultimate_way_to_eat_a_banana_gorilla_eating_asmr_satisfying_gbbmk9&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Massive_MTB_CRASH_-_Over_the_bars_erqjcv',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Massive_MTB_CRASH_-_Over_the_bars_erqjcv&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Cat_Plays_Piano_cats_piano_jerrka',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Cat_Plays_Piano_cats_piano_jerrka&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'The_Perfect_Line_evcdhb',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=The_Perfect_Line_evcdhb&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Switzerland_The_Land_of_Pure_Nature_ihzwlt',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Switzerland_The_Land_of_Pure_Nature_ihzwlt&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Satisfying_Snow_Removal_ViralHog_gjpcwn',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Satisfying_Snow_Removal_ViralHog_gjpcwn&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'King_Charles_and_Queen_Camilla_appear_on_Buckingham_Palace_balcony_kkqjkb',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=King_Charles_and_Queen_Camilla_appear_on_Buckingham_Palace_balcony_kkqjkb&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'corgi_slid_down_an_overpass_with_relatively_few_people._skateboardingdog_jnce3v',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=corgi_slid_down_an_overpass_with_relatively_few_people._skateboardingdog_jnce3v&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'galloping_horse_riding_by_a_beautiful_lady_on_the_beach._jttqql',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=galloping_horse_riding_by_a_beautiful_lady_on_the_beach._jttqql&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'BASE_jumping_Switzerland_am0306',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=BASE_jumping_Switzerland_am0306&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Going_full_blast_at_100km_h_into_this_corner_downhill_speed_longboard_skate_fsmito',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Going_full_blast_at_100km_h_into_this_corner_downhill_speed_longboard_skate_fsmito&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'New_Pope_Chosen_as_White_Smoke_Rises_From_Vatican_hgvjih',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=New_Pope_Chosen_as_White_Smoke_Rises_From_Vatican_hgvjih&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Husband_tries_to_impress_people_at_wedding_But_fails_WEDDING_FAIL_guy_hits_his_head_as_he_walks_bw2asp',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Husband_tries_to_impress_people_at_wedding_But_fails_WEDDING_FAIL_guy_hits_his_head_as_he_walks_bw2asp&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'The_she_wolves_of_Atlanta_were_fire_tonight_my_pack_is_back_LMYNLWorldTourAtlanta_gmcurp',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=The_she_wolves_of_Atlanta_were_fire_tonight_my_pack_is_back_LMYNLWorldTourAtlanta_gmcurp&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'The_King_s_Guard_Standing_Still_npsysx',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=The_King_s_Guard_Standing_Still_npsysx&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Panda_Falling_Funny_Videos_capfwl',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Panda_Falling_Funny_Videos_capfwl&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Ignition_of_the_Most_Powerful_Rocket_In_The_World_SpaceX_s_Starship_cn5pvx',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Ignition_of_the_Most_Powerful_Rocket_In_The_World_SpaceX_s_Starship_cn5pvx&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Fastest_time_to_eat_a_muffin_-_15.25_seconds_by_Leah_Shutkever_vqzfb6',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Fastest_time_to_eat_a_muffin_-_15.25_seconds_by_Leah_Shutkever_vqzfb6&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Current_men_s_Olympic_record_in_speed_climbing_Bassa_Mawem_Tokyo_2020_vt0ram',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Current_men_s_Olympic_record_in_speed_climbing_Bassa_Mawem_Tokyo_2020_vt0ram&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Longest_gurn_with_the_lower_lip_covering_the_nostrils_-_1_min_and_2_secs_by_Jovante_Carter_holygxd_qngtbt',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Longest_gurn_with_the_lower_lip_covering_the_nostrils_-_1_min_and_2_secs_by_Jovante_Carter_holygxd_qngtbt&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'Breathless_Romantic_Dinner_Experience_in_Italy_%EF%B8%8F_wine_romance_dinner_italy_love_nmjdgl',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=Breathless_Romantic_Dinner_Experience_in_Italy_%EF%B8%8F_wine_romance_dinner_italy_love_nmjdgl&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'sprint_block_start_technically_perfect_shorts_tranding_motivation_sprint_kemfdn',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=sprint_block_start_technically_perfect_shorts_tranding_motivation_sprint_kemfdn&profile=cld-default',
    downloadUrl: ''
  },
  {
    publicId: 'That_evening_glow_in_the_cottage_garden_cottagegarden_hqns7b',
    originalUrl: 'https://player.cloudinary.com/embed/?cloud_name=dtszsqfxo&public_id=That_evening_glow_in_the_cottage_garden_cottagegarden_hqns7b&profile=cld-default',
    downloadUrl: ''
  }
];

// Main function
async function main() {
  console.log('☁️  Cloudinary Video Downloader\n');
  
  try {
    // Load configuration
    const loadedConfig = await loadEnvConfig();
    config = loadedConfig;
    
    console.log(`☁️  Cloud Name: dtszsqfxo`);
    console.log(`📹 Found ${cloudinaryVideos.length} videos to download\n`);
    
    // Build download URLs for all videos
    const downloadOptions: DownloadOptions = {
      folder: './media',
      format: 'mp4',
      quality: 80
    };
    
    // Update videos with download URLs
    const videosWithUrls = cloudinaryVideos.map(video => ({
      ...video,
      downloadUrl: buildVideoDownloadUrl(video.publicId, downloadOptions)
    }));
    
    // Download all videos
    await downloadCloudinaryVideos(videosWithUrls, downloadOptions);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
} 