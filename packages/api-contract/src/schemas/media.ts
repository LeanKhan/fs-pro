import { z } from 'zod';

export const MediaItemSchema = z.object({
  id: z.string(),
  type: z.enum(['news', 'promo', 'picture', 'video']),
  category: z.enum(['derby', 'matchday', 'transfer', 'club_press', 'commercial', 'general']),
  badge: z.string(),
  badgeColor: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  summary: z.string(),
  bulletPoints: z.array(z.string()).optional(),
  hero: z
    .object({
      format: z.enum([
        'derby_faceoff',
        'crest_clash',
        'stadium',
        'poster',
        'video_player',
        'photo',
        'season_champions',
        'season_recap',
        'transfer_wire',
      ]),
      homeCode: z.string().optional(),
      awayCode: z.string().optional(),
      homeName: z.string().optional(),
      awayName: z.string().optional(),
      stadiumName: z.string().optional(),
      stadiumCapacity: z.number().optional(),
      bannerTheme: z.string().optional(),
      videoDuration: z.string().optional(),
      imageUrl: z.string().optional(),
      caption: z.string().optional(),
      // Season finale fields
      championCode: z.string().optional(),
      championName: z.string().optional(),
      championPoints: z.number().optional(),
      championGoalDiff: z.number().optional(),
      userClubRank: z.number().optional(),
      userClubCode: z.string().optional(),
      totalTeams: z.number().optional(),
      competitionName: z.string().optional(),
      seasonCode: z.string().optional(),
    })
    .optional(),
  transferDetails: z
    .object({
      playerId: z.string().optional(),
      playerName: z.string(),
      position: z.string().optional(),
      age: z.number().optional(),
      rating: z.number().optional(),
      fee: z.number(),
      wage: z.number().optional(),
      value: z.number().optional(),
      buyerClubId: z.string().optional(),
      buyerClubName: z.string(),
      buyerClubCode: z.string(),
      sellerClubId: z.string().optional(),
      sellerClubName: z.string().optional(),
      sellerClubCode: z.string().optional(),
      fromOrigin: z.string(),
      toDestination: z.string(),
      dealType: z.string().optional(),
      date: z.string().optional(),
      managerQuote: z.string().optional(),
      scoutingVerdict: z.string().optional(),
    })
    .optional(),
  fullStory: z.string().optional(),
  quote: z
    .object({
      author: z.string(),
      role: z.string(),
      text: z.string(),
    })
    .optional(),
  actions: z
    .array(
      z.object({
        label: z.string(),
        action: z.string(),
        to: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .optional(),
  timestamp: z.string(),
  hypeScore: z.number().optional(),
});

export type MediaItem = z.infer<typeof MediaItemSchema>;
