

// 自定義錯誤類別
export class YouTubeAPIError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(message: string, code: string, statusCode?: number, originalError?: Error) {
    super(message);
    this.name = 'YouTubeAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

// 錯誤代碼枚舉
export enum ErrorCodes {
  NETWORK_ERROR = 'NETWORK_ERROR',
  INIT_DATA_ERROR = 'INIT_DATA_ERROR',
  PLAYER_DATA_ERROR = 'PLAYER_DATA_ERROR',
  INVALID_PLAYLIST = 'INVALID_PLAYLIST',
  INVALID_VIDEO_ID = 'INVALID_VIDEO_ID',
  INVALID_CHANNEL_ID = 'INVALID_CHANNEL_ID',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// 錯誤處理器
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLogger?: (error: YouTubeAPIError) => void;

  private constructor() { }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public setErrorLogger(logger: (error: YouTubeAPIError) => void): void {
    this.errorLogger = logger;
  }

  public handleError(error: any, context: string, code: ErrorCodes = ErrorCodes.UNKNOWN_ERROR): never {
    let youtubeError: YouTubeAPIError;

    if (error instanceof YouTubeAPIError) {
      youtubeError = error;
    } else {
      const message = this.getErrorMessage(code, context, error?.message || error?.toString() || '未知錯誤');
      youtubeError = new YouTubeAPIError(message, code, undefined, error);
    }

    // 記錄錯誤
    if (this.errorLogger) {
      this.errorLogger(youtubeError);
    } else {
      console.error(`[YouTubeAPI Error] ${youtubeError.code}: ${youtubeError.message}`);
    }

    throw youtubeError;
  }

  private getErrorMessage(code: ErrorCodes, context: string, originalMessage?: string): string {
    const errorMessages: Record<ErrorCodes, string> = {
      [ErrorCodes.NETWORK_ERROR]: `Network connection error: ${context}`,
      [ErrorCodes.INIT_DATA_ERROR]: `Cannot get initialization data: ${context}`,
      [ErrorCodes.PLAYER_DATA_ERROR]: `Cannot get player data: ${context}`,
      [ErrorCodes.INVALID_PLAYLIST]: `Invalid playlist ID: ${context}`,
      [ErrorCodes.INVALID_VIDEO_ID]: `Invalid video ID: ${context}`,
      [ErrorCodes.INVALID_CHANNEL_ID]: `Invalid channel ID: ${context}`,
      [ErrorCodes.RATE_LIMIT_ERROR]: `Rate limit exceeded, please try again later: ${context}`,
      [ErrorCodes.PARSE_ERROR]: `Data parsing error: ${context}`,
      [ErrorCodes.UNKNOWN_ERROR]: `Unknown error: ${context}`
    };

    const baseMessage = errorMessages[code];
    return originalMessage ? `${baseMessage} (${originalMessage})` : baseMessage;
  }

  public createError(message: string, code: ErrorCodes, statusCode?: number, originalError?: Error): YouTubeAPIError {
    return new YouTubeAPIError(message, code, statusCode, originalError);
  }
}

// 全域錯誤處理器實例
const errorHandler = ErrorHandler.getInstance();

const USER_AGENT = 'ysa-v2.0.2';
const youtubeEndpoint = `https://www.youtube.com`;

interface YoutubeInitData {
  initdata: any;
  apiToken: string | null;
  context: any;
}

interface YoutubePlayerDetail {
  videoId: string;
  thumbnails: any;
  author?: string;
  channelId: string;
  shortDescription: string;
  keywords: string[];
}

export interface SearchItem {
  id: string;
  type: string;
  thumbnails: any;
  title: string;
  channelTitle?: string;
  shortBylineText?: string;
  length?: string | any;
  isLive?: boolean;
  videos?: any[];
  videoCount?: string;
}

export interface SearchResult {
  items: SearchItem[];
  nextPage: {
    nextPageToken: string | null;
    nextPageContext: any;
  };
}

export interface PlaylistResult {
  items: SearchItem[];
  metadata: any;
}

export interface ChannelResult {
  title: string;
  content: any;
}

export interface VideoDetails {
  id: string;
  title: string;
  thumbnails: any[];
  isLive: boolean;
  channel: string;
  channelId: string;
  description: string;
  keywords: string[];
  suggestion: SearchItem[];
}

export interface ShortVideo {
  id: string;
  type: string;
  thumbnails: any;
  title: string;
  inlinePlaybackEndpoint: any;
}

interface SearchOptions {
  type: string;
}

interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

interface PlaylistItem {
  id: string;
  title: string;
  contentType: string;
  thumbnails: Thumbnail[];
  firstVideoId: string | null;
  videoCount: string | null;
}

function extractPlaylists(sectionListRenderer: any[]): PlaylistItem[] {
  const playlists: PlaylistItem[] = [];

  sectionListRenderer.forEach((section: any) => {
    if (section.itemSectionRenderer) {
      section.itemSectionRenderer.contents.forEach((item: any) => {
        if (item.lockupViewModel) {
          const lockup = item.lockupViewModel;
          const contentId = lockup.contentId;
          const contentType = lockup.contentType;
          const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
          
          // Get all thumbnails from sources
          const thumbnailSources = lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
          const thumbnails = thumbnailSources.map((source: any) => ({
            url: source.url,
            width: source.width,
            height: source.height
          }));

          // Get first video ID from itemPlayback
          const firstVideoId = lockup.itemPlayback?.inlinePlayerData?.onSelect?.innertubeCommand?.watchEndpoint?.videoId || null;

          // Get video count from thumbnail badge (e.g., "29 video", "145 episode")
          const thumbnailBadges = lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays?.[0]?.thumbnailOverlayBadgeViewModel?.thumbnailBadges || [];
          const videoCount = thumbnailBadges[0]?.thumbnailBadgeViewModel?.text || null;

          // Only include playlists and podcasts (podcasts are also playlists on YouTube)
          if (
            (contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' || 
             contentType === 'LOCKUP_CONTENT_TYPE_PODCAST') &&
            contentId &&
            title
          ) {
            playlists.push({
              id: contentId,
              title: title,
              contentType: contentType,
              thumbnails: thumbnails,
              firstVideoId: firstVideoId,
              videoCount: videoCount
            });
          }
        }
      });
    }
  });

  return playlists;
}

function extractPlaylistVideos(data: any): VideoDetails[] {
  const videos: VideoDetails[] = [];

  try {
    const contents = data.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

    if (!contents) {
      return videos;
    }

    contents.forEach((item: any) => {
      if (item.playlistVideoRenderer) {
        const video = item.playlistVideoRenderer;

        // Skip continuation items
        if (!video.videoId) {
          return;
        }

        videos.push({
          id: video.videoId,
          title: video.title?.runs?.[0]?.text || video.title?.simpleText || '',
          thumbnails: video.thumbnail?.thumbnails || [],
          isLive: false,
          channel: video.shortBylineText?.runs?.[0]?.text || '',
          channelId: video.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
          description: '',
          keywords: [],
          suggestion: []
        });
      }
    });

    return videos;
  } catch (error) {
    console.error('Error extracting playlist videos:', error);
    return videos;
  }
}

export const GetPlaylistDetails = async (playlistId: string) => {

  const page = await GetYoutubeInitData(`${youtubeEndpoint}/playlist?list=${playlistId}`);

  const sectionListRenderer = page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content
    .sectionListRenderer

  const videos = extractPlaylistVideos(sectionListRenderer);

  return videos;
}

export const GetYoutubeInitData = async (url: string): Promise<YoutubeInitData> => {
  let initdata: any = {};
  let apiToken: string | null = null;
  let context: any = null;
  try {
    const response = await fetch(encodeURI(url), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.youtube.com',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const ytInitData = text.split("var ytInitialData =");
    if (ytInitData && ytInitData.length > 1) {
      const data = ytInitData[1].split("</script>")[0].slice(0, -1);

      if (text.split("innertubeApiKey").length > 1) {
        const apiKeyPart = text.split("innertubeApiKey")[1];
        if (apiKeyPart) {
          apiToken = apiKeyPart
            .trim()
            .split(",")[0]
            .split('"')[2];
        }
      }

      if (text.split("INNERTUBE_CONTEXT").length > 1) {
        const contextPart = text.split("INNERTUBE_CONTEXT")[1];
        if (contextPart) {
          context = JSON.parse(
            contextPart.trim().slice(2, -2)
          );
        }
      }

      initdata = JSON.parse(data);
      return { initdata, apiToken, context };
    } else {
      errorHandler.handleError(
        new Error("Cannot parse YouTube initialization data"),
        `URL: ${url}`,
        ErrorCodes.INIT_DATA_ERROR
      );
      // 這行永遠不會執行，因為 handleError 會拋出錯誤
      throw new Error("Unreachable code");
    }
  } catch (ex) {
    if (ex instanceof YouTubeAPIError) {
      throw ex;
    }
    errorHandler.handleError(ex, `Failed to get initialization data - URL: ${url}`, ErrorCodes.INIT_DATA_ERROR);
    // 這行永遠不會執行，因為 handleError 會拋出錯誤
    throw new Error("Unreachable code");
  }
};

const GetYoutubePlayerDetail = async (
  url: string
): Promise<YoutubePlayerDetail> => {
  let initdata: any = {};
  try {
    const response = await fetch(encodeURI(url), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.youtube.com',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const ytInitData = text.split("var ytInitialPlayerResponse =");
    if (ytInitData && ytInitData.length > 1) {
      const data = ytInitData[1].split("</script>")[0].slice(0, -1);
      initdata = JSON.parse(data);
      return { ...initdata.videoDetails };
    } else {
      errorHandler.handleError(
        new Error("Cannot parse YouTube player data"),
        `URL: ${url}`,
        ErrorCodes.PLAYER_DATA_ERROR
      );
      // 這行永遠不會執行，因為 handleError 會拋出錯誤
      throw new Error("Unreachable code");
    }
  } catch (ex) {
    if (ex instanceof YouTubeAPIError) {
      throw ex;
    }
    errorHandler.handleError(ex, `Failed to get player data - URL: ${url}`, ErrorCodes.PLAYER_DATA_ERROR);
    // 這行永遠不會執行，因為 handleError 會拋出錯誤
    throw new Error("Unreachable code");
  }
};

const GetData = async (
  keyword: string,
  withPlaylist: boolean = false,
  limit: number = 0,
  options: SearchOptions[] = []
): Promise<SearchResult> => {
  let endpoint = `${youtubeEndpoint}/results?search_query=${encodeURIComponent(keyword)}`;
  try {
    if (Array.isArray(options) && options.length > 0) {
      const type = options.find((z) => z.type);
      if (type && typeof type.type === "string") {
        switch (type.type.toLowerCase()) {
          case "video":
            endpoint = `${endpoint}&sp=EgIQAQ%3D%3D`;
            break;
          case "channel":
            endpoint = `${endpoint}&sp=EgIQAg%3D%3D`;
            break;
          case "playlist":
            endpoint = `${endpoint}&sp=EgIQAw%3D%3D`;
            break;
          case "movie":
            endpoint = `${endpoint}&sp=EgIQBA%3D%3D`;
            break;
        }
      }
    }
    const page = await GetYoutubeInitData(endpoint);

    const sectionListRenderer =
      page.initdata.contents.twoColumnSearchResultsRenderer.primaryContents
        .sectionListRenderer;

    let contToken: any = {};

    let items: SearchItem[] = [];

    //write sectionListRenderer.contents to local json
    
    // fs.writeFileSync('sectionListRenderer.json', JSON.stringify(sectionListRenderer.contents, null, 2));

    // Extract playlists using the new format
    let extractedPlaylists: PlaylistItem[] | null = null;
    if (withPlaylist) extractedPlaylists = extractPlaylists(sectionListRenderer.contents);

    sectionListRenderer.contents.forEach((content: any) => {
      if (content.continuationItemRenderer) {
        contToken =
          content.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      } else if (content.itemSectionRenderer) {
        content.itemSectionRenderer.contents.forEach((item: any) => {
          if (item.channelRenderer) {
            let channelRenderer = item.channelRenderer;
            items.push({
              id: channelRenderer.channelId,
              type: "channel",
              thumbnails: channelRenderer.thumbnail,
              title: channelRenderer.title.simpleText
            });
          } else {
            let videoRender = item.videoRenderer;
            // let playListRender = item.playlistRenderer;

            if (videoRender && videoRender.videoId) {
              items.push(VideoRender(item));
            }
            // if (withPlaylist) {
            //   if (playListRender && playListRender.playlistId) {
            //     items.push({
            //       id: playListRender.playlistId,
            //       type: "playlist",
            //       thumbnail: playListRender.thumbnails,
            //       title: playListRender.title.simpleText,
            //       length: playListRender.videoCount,
            //       videos: playListRender.videos,
            //       videoCount: playListRender.videoCount,
            //       isLive: false
            //     });
            //   }
            // }
          }
        });
      }
    });
    
    // Add extracted playlists from new format
    if (withPlaylist  && extractedPlaylists) {
      extractedPlaylists.forEach(playlist => {
        // Parse video count from string like "29 video" or "145 episode"
        const countMatch = playlist.videoCount?.match(/(\d+)/);
        const videoCount = countMatch ? parseInt(countMatch[1]) : 0;
        
        items.push({
          id: playlist.id,
          type: "playlist",
          thumbnails: playlist.thumbnails,
          title: playlist.title,
          length: videoCount,
          videos: [],
          videoCount: `${videoCount} Videos`,
          isLive: false
        });
      });
    }
    
    const apiToken = page.apiToken;
    const context = page.context;
    const nextPageContext = { context, continuation: contToken };
    const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
    return {
      items: itemsResult,
      nextPage: { nextPageToken: apiToken, nextPageContext }
    };
  } catch (ex) {
    if (ex instanceof YouTubeAPIError) {
      throw ex;
    }
    errorHandler.handleError(ex, `Search failed - keyword: ${keyword}`, ErrorCodes.UNKNOWN_ERROR);
    // 這行永遠不會執行，因為 handleError 會拋出錯誤
    throw new Error("Unreachable code");
  }
};

const nextPage = async (
  nextPage: { nextPageToken: string | null; nextPageContext: any },
  withPlaylist: boolean = false,
  limit: number = 0
): Promise<SearchResult> => {
  const endpoint = `${youtubeEndpoint}/youtubei/v1/search?key=${nextPage.nextPageToken}`;
  try {
    const response = await fetch(encodeURI(endpoint), {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.youtube.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nextPage.nextPageContext)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: any = await response.json();
    const item1 =
      data.onResponseReceivedCommands[0].appendContinuationItemsAction;
    let items: SearchItem[] = [];
    item1.continuationItems.forEach((conitem: any) => {
      if (conitem.itemSectionRenderer) {
        conitem.itemSectionRenderer.contents.forEach(async (item: any) => {
          let videoRender = item.videoRenderer;
          let playListRender = item.playlistRenderer;
          if (videoRender && videoRender.videoId) {
            items.push(VideoRender(item));
          }
          if (withPlaylist) {
            if (playListRender && playListRender.playlistId) {
              items.push({
                id: playListRender.playlistId,
                type: "playlist",
                thumbnails: playListRender.thumbnails,
                title: playListRender.title.simpleText,
                length: playListRender.videoCount,
                videos: (await GetPlaylistData(playListRender.playlistId))
                  .items,
                videoCount: playListRender.videoCount,
                isLive: false
              });
            }
          }
        });
      } else if (conitem.continuationItemRenderer) {
        nextPage.nextPageContext.continuation =
          conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }
    });
    const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
    return { items: itemsResult, nextPage };
  } catch (ex) {
    if (ex instanceof YouTubeAPIError) {
      throw ex;
    }
    errorHandler.handleError(ex, `Failed to get next page`, ErrorCodes.UNKNOWN_ERROR);
    // 這行永遠不會執行，因為 handleError 會拋出錯誤
    throw new Error("Unreachable code");
  }
};

const GetPlaylistData = async (
  playlistId: string,
  limit: number = 0
): Promise<PlaylistResult> => {
  const endpoint = `${youtubeEndpoint}/playlist?list=${playlistId}`;
  try {
    const initData = await GetYoutubeInitData(endpoint);
    const sectionListRenderer = initData.initdata;
    const metadata = sectionListRenderer.metadata;
    if (sectionListRenderer && sectionListRenderer.contents) {
      const videoItems =
        sectionListRenderer.contents.twoColumnBrowseResultsRenderer.tabs[0]
          .tabRenderer.content.sectionListRenderer.contents[0]
          .itemSectionRenderer.contents[0].playlistVideoListRenderer.contents;
      let items: SearchItem[] = [];
      videoItems.forEach((item: any) => {
        let videoRender = item.playlistVideoRenderer;
        if (videoRender && videoRender.videoId) {
          items.push(VideoRender(item));
        }
      });
      const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
      return { items: itemsResult, metadata };
    } else {
      errorHandler.handleError(
        new Error("Invalid playlist"),
        `播放清單 ID: ${playlistId}`,
        ErrorCodes.INVALID_PLAYLIST
      );
      // 這行永遠不會執行，因為 handleError 會拋出錯誤
      throw new Error("Unreachable code");
    }
  } catch (ex) {
    if (ex instanceof YouTubeAPIError) {
      throw ex;
    }
    errorHandler.handleError(ex, `Failed to get playlist - ID: ${playlistId}`, ErrorCodes.UNKNOWN_ERROR);
    // 這行永遠不會執行，因為 handleError 會拋出錯誤
    throw new Error("Unreachable code");
  }
};

const GetSuggestData = async (
  limit: number = 0
): Promise<{ items: SearchItem[] }> => {
  const endpoint = youtubeEndpoint;
  try {
    const page = await GetYoutubeInitData(endpoint);
    const sectionListRenderer =
      page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer
        .content.richGridRenderer.contents;
    let items: SearchItem[] = [];
    let otherItems: any[] = [];
    sectionListRenderer.forEach((item: any) => {
      if (item.richItemRenderer && item.richItemRenderer.content) {
        let videoRender = item.richItemRenderer.content.videoRenderer;
        if (videoRender && videoRender.videoId) {
          items.push(VideoRender(item.richItemRenderer.content));
        } else {
          otherItems.push(videoRender);
        }
      }
    });
    const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
    return { items: itemsResult };
  } catch (ex) {
    console.error(ex);
    throw ex;
  }
};

const GetChannelById = async (channelId: string): Promise<ChannelResult[]> => {
  const endpoint = `${youtubeEndpoint}/channel/${channelId}`;
  try {
    const page = await GetYoutubeInitData(endpoint);
    const tabs = page.initdata.contents.twoColumnBrowseResultsRenderer.tabs;
    const items = tabs
      .map((json: any) => {
        if (json && json.tabRenderer) {
          const tabRenderer = json.tabRenderer;
          const title = tabRenderer.title;
          const content = tabRenderer.content;
          return { title, content };
        }
      })
      .filter((y: any) => typeof y !== "undefined") as ChannelResult[];
    return items;
  } catch (ex) {
    console.error(ex);
    throw ex;
  }
};

const GetVideoDetails = async (videoId: string): Promise<VideoDetails> => {
  const endpoint = `${youtubeEndpoint}/watch?v=${videoId}`;
  try {
    const page = await GetYoutubeInitData(endpoint);
    const playerData = await GetYoutubePlayerDetail(endpoint);

    const result = page.initdata.contents.twoColumnWatchNextResults;
    const firstContent =
      result.results.results.contents[0].videoPrimaryInfoRenderer;
    const secondContent =
      result.results.results.contents[1].videoSecondaryInfoRenderer;
    const res: VideoDetails = {
      id: playerData.videoId,
      title: firstContent.title.runs[0].text,
      thumbnails: playerData.thumbnails || [],
      isLive: firstContent.viewCount.videoViewCountRenderer.hasOwnProperty(
        "isLive"
      )
        ? firstContent.viewCount.videoViewCountRenderer.isLive
        : false,
      channel:
        playerData.author ||
        secondContent.owner.videoOwnerRenderer.title.runs[0].text,
      channelId: playerData.channelId,
      description: playerData.shortDescription,
      keywords: playerData.keywords,
      suggestion: result.secondaryResults.secondaryResults.results
        .filter((y: any) => y.hasOwnProperty("compactVideoRenderer"))
        .map((x: any) => compactVideoRenderer(x))
    };

    return res;
  } catch (ex) {
    console.error(ex);
    throw ex;
  }
};

export const VideoRender = (json: any): SearchItem => {
  try {
    if (json && (json.videoRenderer || json.playlistVideoRenderer)) {
      let videoRenderer = json.videoRenderer || json.playlistVideoRenderer;
      let isLive = false;
      if (
        videoRenderer.badges &&
        videoRenderer.badges.length > 0 &&
        videoRenderer.badges[0].metadataBadgeRenderer &&
        videoRenderer.badges[0].metadataBadgeRenderer.style ===
        "BADGE_STYLE_TYPE_LIVE_NOW"
      ) {
        isLive = true;
      }
      if (videoRenderer.thumbnailOverlays) {
        videoRenderer.thumbnailOverlays.forEach((item: any) => {
          if (
            item.thumbnailOverlayTimeStatusRenderer &&
            item.thumbnailOverlayTimeStatusRenderer.style &&
            item.thumbnailOverlayTimeStatusRenderer.style === "LIVE"
          ) {
            isLive = true;
          }
        });
      }
      const id = videoRenderer.videoId;
      const thumbnails = videoRenderer.thumbnail;
      const title = videoRenderer.title.runs[0].text;
      const shortBylineText = videoRenderer.shortBylineText
        ? videoRenderer.shortBylineText
        : "";
      const lengthText = videoRenderer.lengthText
        ? videoRenderer.lengthText
        : "";
      const channelTitle =
        videoRenderer.ownerText && videoRenderer.ownerText.runs
          ? videoRenderer.ownerText.runs[0].text
          : "";
      return {
        id,
        type: "video",
        thumbnails,
        title,
        channelTitle,
        shortBylineText,
        length: lengthText,
        isLive
      };
    }
    return {
      id: "",
      type: "",
      thumbnails: undefined,
      title: ""
    };
  } catch (ex) {
    throw ex;
  }
};

const compactVideoRenderer = (json: any): SearchItem => {
  const compactVideoRendererJson = json.compactVideoRenderer;
  let isLive = false;
  if (
    compactVideoRendererJson.badges &&
    compactVideoRendererJson.badges.length > 0 &&
    compactVideoRendererJson.badges[0].metadataBadgeRenderer &&
    compactVideoRendererJson.badges[0].metadataBadgeRenderer.style ===
    "BADGE_STYLE_TYPE_LIVE_NOW"
  ) {
    isLive = true;
  }
  return {
    id: compactVideoRendererJson.videoId,
    type: "video",
    thumbnails: compactVideoRendererJson.thumbnail.thumbnails,
    title: compactVideoRendererJson.title.simpleText,
    channelTitle: compactVideoRendererJson.shortBylineText.runs[0].text,
    shortBylineText: compactVideoRendererJson.shortBylineText.runs[0].text,
    length: compactVideoRendererJson.lengthText,
    isLive
  };
};

const GetShortVideo = async (): Promise<ShortVideo[]> => {
  const page = await GetYoutubeInitData(youtubeEndpoint);
  const shortResult =
    page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents
      .filter((x: any) => x.richSectionRenderer)
      .map((z: any) => z.richSectionRenderer.content)
      .filter((y: any) => y.richShelfRenderer)
      .map((u: any) => u.richShelfRenderer)
      .find((i: any) => i.title.runs[0].text === "Shorts");
  const res = shortResult.contents
    .map((z: any) => z.richItemRenderer)
    .map((y: any) => y.content.reelItemRenderer);
  return res.map((json: any) => ({
    id: json.videoId,
    type: "reel",
    thumbnails: json.thumbnail.thumbnails[0],
    title: json.headline.simpleText,
    inlinePlaybackEndpoint: json.inlinePlaybackEndpoint || {}
  }));
};

export {
  GetData as GetListByKeyword,
  nextPage as NextPage,
  GetPlaylistData,
  GetSuggestData,
  GetChannelById,
  GetVideoDetails,
  GetShortVideo
};