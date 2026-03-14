export type Platform = 'youtube' | 'twitch'

export type SubscribedChannel = {
  platformChannelId: string
  name: string
  iconUrl: string | null
}

export type ChannelMeta = {
  platformChannelId: string
  name: string
  iconUrl: string | null
  uploadsPlaylistId: string
}

export type PlaylistItem = {
  platformContentId: string
  title: string
  publishedAt: string | null
}

export type VideoDetail = {
  platformContentId: string
  title: string
  liveBroadcastContent: 'none' | 'live' | 'upcoming'
  publishedAt: string | null
  scheduledStartTime: string | null
  actualStartTime: string | null
  actualEndTime: string | null
}

export interface PlatformAdapter {
  // subscriptions.list: チャンネル同期用（全ページ取得）
  getSubscribedChannels(accessToken: string): Promise<SubscribedChannel[]>

  // channels.list: uploadsPlaylistId + メタデータのバッチ取得（最大50件/call）
  getChannelMetas(platformChannelIds: string[], accessToken: string): Promise<ChannelMeta[]>

  // playlistItems.list: アップロードプレイリストから最新N件取得（1ページのみ）
  getPlaylistItems(
    uploadsPlaylistId: string,
    accessToken: string,
    maxResults?: number,
  ): Promise<PlaylistItem[]>

  // videos.list: 動画詳細のバッチ取得（最大50件/call。超過時は自動分割）
  getVideoDetails(platformContentIds: string[], accessToken: string): Promise<VideoDetail[]>
}
