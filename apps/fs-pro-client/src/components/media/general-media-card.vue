<template>
  <v-card class="general-media-card rounded-lg elevation-4 d-flex flex-column" height="100%" min-height="460px">
    <!-- Top Header Strip -->
    <div class="media-header px-4 py-3 d-flex align-center justify-space-between border-b">
      <div class="d-flex align-center gap-2">
        <span class="live-pulse-dot mr-1"></span>
        <span class="text-caption font-weight-black text-uppercase tracking-wider text-amber-accent-2">
          MEDIA &amp; BROADCAST HUB
        </span>
      </div>

      <!-- Navigation Arrows -->
      <div v-if="filteredItems.length > 1" class="d-flex align-center gap-1">
        <v-btn
          icon="mdi-chevron-left"
          size="x-small"
          variant="tonal"
          density="comfortable"
          :disabled="currentIndex === 0"
          @click="prevItem"
        />
        <span class="text-caption text-medium-emphasis mx-1">
          {{ currentIndex + 1 }}/{{ filteredItems.length }}
        </span>
        <v-btn
          icon="mdi-chevron-right"
          size="x-small"
          variant="tonal"
          density="comfortable"
          :disabled="currentIndex === filteredItems.length - 1"
          @click="nextItem"
        />
      </div>
    </div>

    <!-- Tune-In Channel Selector Bar -->
    <div class="px-3 py-2 bg-surface-variant-darker border-b d-flex align-center justify-space-between">
      <div class="d-flex align-center gap-1">
        <v-icon size="16" color="amber-accent-2" class="tune-icon">mdi-radio-tower</v-icon>
        <span class="text-caption font-weight-black text-uppercase text-medium-emphasis" style="font-size: 11px !important; letter-spacing: 0.5px;">
          TUNE-IN:
        </span>
      </div>

      <v-menu location="bottom end" transition="slide-y-transition">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            size="x-small"
            variant="tonal"
            color="amber-accent-3"
            append-icon="mdi-chevron-down"
            class="font-weight-bold text-none px-2"
          >
            <v-icon :icon="currentChannelInfo.icon" size="14" :color="currentChannelInfo.color" class="mr-1" />
            <span>{{ currentChannelInfo.label }}</span>
          </v-btn>
        </template>
        <v-list density="compact" bg-color="#181926" class="border border-opacity-25 rounded-lg py-1" width="280">
          <v-list-item
            v-for="ch in channelOptions"
            :key="ch.value"
            :active="selectedChannel === ch.value"
            active-color="amber-accent-3"
            density="compact"
            class="py-1 cursor-pointer"
            @click="selectChannel(ch.value)"
          >
            <template #prepend>
              <v-icon :icon="ch.icon" size="small" :color="ch.color" class="mr-2" />
            </template>
            <v-list-item-title class="text-caption font-weight-bold">
              {{ ch.label }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-medium-emphasis" style="font-size: 10px !important;">
              {{ ch.desc }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <!-- Filter Pills: All | Transfers | News | Promos | Video | Photos -->
    <div class="px-3 pt-2 pb-1 bg-surface-variant-darker overflow-x-auto">
      <v-chip-group
        v-model="selectedTypeFilter"
        mandatory
        density="compact"
        color="amber-accent-3"
      >
        <v-chip value="all" size="x-small" filter variant="tonal">
          ⚡ ALL
        </v-chip>
        <v-chip
          v-if="countByCategory('transfer') > 0"
          value="transfer"
          size="x-small"
          filter
          variant="tonal"
          color="teal-accent-4"
          class="font-weight-bold"
        >
          💰 TRANSFERS ({{ countByCategory('transfer') }})
        </v-chip>
        <v-chip value="news" size="x-small" filter variant="tonal">
          📰 NEWS ({{ countByType('news') }})
        </v-chip>
        <v-chip value="promo" size="x-small" filter variant="tonal">
          🎨 PROMOS ({{ countByType('promo') }})
        </v-chip>
        <v-chip value="video" size="x-small" filter variant="tonal">
          🎬 VIDEO ({{ countByType('video') }})
        </v-chip>
        <v-chip value="picture" size="x-small" filter variant="tonal">
          📸 PHOTOS ({{ countByType('picture') }})
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="d-flex flex-column align-center justify-center flex-grow-1 pa-6">
      <v-progress-circular indeterminate color="amber-accent-3" size="42" class="mb-3" />
      <span class="text-caption text-medium-emphasis">Tuning broadcast frequency...</span>
    </div>

    <!-- Active Media Item Content -->
    <div v-else-if="activeItem" class="d-flex flex-column flex-grow-1 pa-4">
      <!-- 1. HERO VISUAL CONTAINER -->

      <!-- A. SEASON FINALE & CHAMPIONS HERO (format: 'season_champions') -->
      <div
        v-if="activeItem.hero?.format === 'season_champions'"
        class="season-champions-hero rounded-lg pa-3 mb-3 text-center position-relative overflow-hidden cursor-pointer"
        @click="openStory(activeItem)"
      >
        <div class="champion-glow-ambient"></div>
        <div class="d-flex align-center justify-space-between mb-2 position-relative z-index-1">
          <v-chip size="x-small" color="amber-accent-4" variant="flat" class="font-weight-black text-black">
            {{ activeItem.badge }}
          </v-chip>
          <div class="d-flex align-center text-caption font-weight-bold text-amber-accent-2">
            <v-icon size="14" class="mr-1">mdi-trophy</v-icon>
            FINAL STANDINGS
          </div>
        </div>

        <!-- Crown and Champion Crest -->
        <div class="champion-crest-wrap my-1 position-relative d-inline-block">
          <div class="crown-icon-badge">
            <v-icon size="26" color="amber-accent-3" class="crown-pulse">mdi-crown</v-icon>
          </div>
          <v-avatar size="64" class="champion-avatar elevation-6">
            <v-icon size="50">custom:{{ activeItem.hero.championCode }}</v-icon>
          </v-avatar>
        </div>

        <!-- Champion Name & Points -->
        <div class="text-subtitle-1 font-weight-black text-amber-accent-2 mt-1 line-height-tight position-relative z-index-1">
          {{ activeItem.hero.championName || activeItem.hero.championCode }}
        </div>
        <div class="text-caption font-weight-bold text-white-50 position-relative z-index-1">
          CHAMPIONS &bull; {{ activeItem.hero.championPoints }} POINTS
          <span v-if="activeItem.hero.championGoalDiff !== undefined">
            &bull; GD {{ (activeItem.hero.championGoalDiff ?? 0) >= 0 ? '+' : '' }}{{ activeItem.hero.championGoalDiff }}
          </span>
        </div>

        <!-- User Club Placement Pill -->
        <div v-if="activeItem.hero.userClubRank" class="mt-2 position-relative z-index-1">
          <v-chip
            size="x-small"
            :color="activeItem.hero.userClubRank === 1 ? 'amber-accent-3' : activeItem.hero.userClubRank <= 3 ? 'light-blue-accent-3' : 'grey-lighten-1'"
            variant="tonal"
            class="font-weight-black text-uppercase"
          >
            <v-icon size="x-small" class="mr-1">mdi-flag-checkered</v-icon>
            Your Club: {{ activeItem.hero.userClubCode || 'RP' }} finished {{ getOrdinal(activeItem.hero.userClubRank) }} of {{ activeItem.hero.totalTeams || 10 }}
          </v-chip>
        </div>

        <div class="text-caption text-white-50 mt-1 font-weight-medium position-relative z-index-1">
          {{ activeItem.hero.competitionName || 'League' }} &bull; Season Concluded
        </div>
      </div>

      <!-- B. TRANSFER WIRE HERO (format: 'transfer_wire') -->
      <div
        v-else-if="activeItem.hero?.format === 'transfer_wire'"
        class="transfer-wire-hero rounded-lg pa-3 mb-3 text-center position-relative overflow-hidden cursor-pointer"
        @click="openStory(activeItem)"
      >
        <div class="transfer-glow-ambient"></div>
        <div class="d-flex align-center justify-space-between mb-2 position-relative z-index-1">
          <v-chip size="x-small" color="teal-accent-4" variant="flat" class="font-weight-black text-black">
            {{ activeItem.badge }}
          </v-chip>
          <div class="d-flex align-center text-caption font-weight-bold text-teal-accent-2">
            <v-icon size="14" class="mr-1">mdi-swap-horizontal</v-icon>
            OFFICIAL DEAL
          </div>
        </div>

        <!-- Transfer Route: From -> Fee -> To -->
        <div class="d-flex align-center justify-center my-2 gap-3 position-relative z-index-1">
          <!-- Selling Club / From -->
          <div class="text-center" style="max-width: 90px;">
            <v-avatar size="48" class="crest-avatar elevation-3">
              <v-icon v-if="activeItem.hero.homeCode && activeItem.hero.homeCode !== 'FA'" size="40">
                custom:{{ activeItem.hero.homeCode }}
              </v-icon>
              <v-icon v-else size="26" color="cyan-accent-3">mdi-account-arrow-left</v-icon>
            </v-avatar>
            <div class="text-caption font-weight-bold text-white mt-1 text-truncate">
              {{ activeItem.transferDetails?.sellerClubCode || (activeItem.hero.homeCode === 'FA' ? 'FREE AGENT' : activeItem.hero.homeCode) }}
            </div>
          </div>

          <!-- Arrow & Fee Badge -->
          <div class="d-flex flex-column align-center px-1">
            <v-chip size="x-small" color="teal-accent-4" variant="tonal" class="font-weight-black mb-1">
              {{ activeItem.transferDetails?.fee ? `€${activeItem.transferDetails.fee.toLocaleString()}` : 'FREE' }}
            </v-chip>
            <v-icon size="20" color="teal-accent-3" class="transfer-arrow-pulse">mdi-arrow-right</v-icon>
          </div>

          <!-- Buying Club / To -->
          <div class="text-center" style="max-width: 90px;">
            <v-avatar size="48" class="crest-avatar elevation-3">
              <v-icon size="40">custom:{{ activeItem.hero.awayCode }}</v-icon>
            </v-avatar>
            <div class="text-caption font-weight-bold text-white mt-1 text-truncate">
              {{ activeItem.transferDetails?.buyerClubCode || activeItem.hero.awayCode }}
            </div>
          </div>
        </div>

        <!-- Player Summary Subtitle -->
        <div class="text-caption font-weight-bold text-amber-accent-2 mt-1 position-relative z-index-1">
          {{ activeItem.transferDetails?.playerName || activeItem.title }}
          <span v-if="activeItem.transferDetails?.position" class="text-white-50">
            ({{ activeItem.transferDetails.position }}, Age {{ activeItem.transferDetails.age }})
          </span>
        </div>
      </div>

      <!-- C. DERBY / CREST CLASH HERO (e.g. Philamentia Derby AP vs RP) -->
      <div
        v-else-if="activeItem.hero?.format === 'derby_faceoff' || activeItem.hero?.format === 'crest_clash'"
        class="derby-hero-banner rounded-lg pa-3 mb-3 text-center position-relative overflow-hidden cursor-pointer"
        :class="activeItem.hero?.bannerTheme === 'derby_fire' ? 'derby-fire-theme' : 'classic-theme'"
        @click="openStory(activeItem)"
      >
        <div class="derby-glow-ambient"></div>
        <div class="d-flex align-center justify-space-between mb-1">
          <v-chip size="x-small" color="amber-accent-3" variant="flat" class="font-weight-black text-black">
            {{ activeItem.badge }}
          </v-chip>
          <div v-if="activeItem.hypeScore" class="d-flex align-center text-caption font-weight-bold text-amber-lighten-2">
            <span class="mr-1">HYPE</span>
            <v-icon
              v-for="n in 5"
              :key="n"
              size="12"
              :color="n <= (activeItem.hypeScore ?? 3) ? 'amber-accent-3' : 'grey-darken-2'"
            >
              mdi-fire
            </v-icon>
          </div>
        </div>

        <!-- Crests Face-Off -->
        <div class="d-flex align-center justify-center my-2 gap-4">
          <div class="crest-container text-center">
            <v-avatar size="52" class="crest-avatar elevation-4">
              <v-icon size="44">custom:{{ activeItem.hero.homeCode }}</v-icon>
            </v-avatar>
            <div class="text-caption font-weight-bold text-white mt-1">
              {{ activeItem.hero.homeCode }}
            </div>
          </div>

          <div class="vs-badge font-weight-black text-h5 text-amber-accent-2 px-2">
            VS
          </div>

          <div class="crest-container text-center">
            <v-avatar size="52" class="crest-avatar elevation-4">
              <v-icon size="44">custom:{{ activeItem.hero.awayCode }}</v-icon>
            </v-avatar>
            <div class="text-caption font-weight-bold text-white mt-1">
              {{ activeItem.hero.awayCode }}
            </div>
          </div>
        </div>

        <!-- Venue Subtitle -->
        <div class="text-caption font-weight-medium text-white-50 mt-1 text-truncate">
          <v-icon size="small" class="mr-1">mdi-stadium</v-icon>
          {{ activeItem.hero.stadiumName || 'Match Venue' }} &bull; SOLD OUT
        </div>
      </div>

      <!-- D. VIDEO PLAYER PREVIEW HERO (includes season_recap) -->
      <div
        v-else-if="activeItem.hero?.format === 'video_player' || activeItem.hero?.format === 'season_recap'"
        class="video-preview-banner rounded-lg pa-4 mb-3 text-center position-relative cursor-pointer d-flex flex-column align-center justify-center"
        @click="simulatePlayVideo"
      >
        <div class="video-overlay-tint"></div>
        <v-icon size="56" color="red-accent-3" class="play-btn-glow mb-1">
          {{ isVideoPlaying ? 'mdi-pause-circle' : 'mdi-play-circle' }}
        </v-icon>
        <span class="text-caption font-weight-bold text-white z-index-1">
          {{ isVideoPlaying ? 'NOW PLAYING STREAM' : 'WATCH HIGHLIGHTS REEL' }}
        </span>
        <div class="d-flex align-center gap-2 mt-2 z-index-1 w-75">
          <v-progress-linear
            :model-value="isVideoPlaying ? videoProgress : 0"
            color="red-accent-3"
            rounded
            height="4"
          />
          <span class="text-caption text-medium-emphasis">
            {{ activeItem.hero.videoDuration || '1:30' }}
          </span>
        </div>
      </div>

      <!-- E. STADIUM / PHOTO HERO -->
      <div
        v-else-if="activeItem.hero?.format === 'stadium' || activeItem.hero?.format === 'photo'"
        class="photo-preview-banner rounded-lg pa-4 mb-3 d-flex flex-column justify-end cursor-pointer"
        @click="openStory(activeItem)"
      >
        <div class="photo-overlay-gradient"></div>
        <div class="z-index-1">
          <v-chip size="x-small" color="teal-accent-4" variant="flat" class="font-weight-bold mb-1 text-black">
            {{ activeItem.badge }}
          </v-chip>
          <div class="text-subtitle-2 font-weight-bold text-white">
            {{ activeItem.hero.stadiumName || activeItem.hero.caption || 'Field of Play' }}
          </div>
        </div>
      </div>

      <!-- F. STANDARD POSTER -->
      <div
        v-else
        class="standard-poster-banner rounded-lg pa-3 mb-3 d-flex align-center justify-space-between bg-primary-darken-3 cursor-pointer"
        @click="openStory(activeItem)"
      >
        <div>
          <v-chip size="x-small" :color="activeItem.badgeColor || 'amber'" class="font-weight-bold mb-1">
            {{ activeItem.badge }}
          </v-chip>
          <div class="text-caption font-weight-bold text-white">
            {{ activeItem.subtitle || 'Broadcast Feed' }}
          </div>
        </div>
        <v-icon size="36" color="amber-lighten-2">mdi-bullhorn-outline</v-icon>
      </div>

      <!-- 2. STORY HEADLINE & SUMMARY (Clickable to open story details) -->
      <div class="mb-2 cursor-pointer story-summary-area rounded pa-1" @click="openStory(activeItem)">
        <div class="d-flex align-center justify-space-between mb-1">
          <h3 class="text-subtitle-1 font-weight-black text-white leading-tight hover-accent">
            {{ activeItem.title }}
          </h3>
          <v-tooltip text="Click to read full dossier & story" location="top">
            <template #activator="{ props: ttProps }">
              <v-icon v-bind="ttProps" size="18" color="amber-accent-3" class="ml-2 flex-shrink-0 open-hint-icon">
                mdi-open-in-new
              </v-icon>
            </template>
          </v-tooltip>
        </div>
        <p class="text-caption text-medium-emphasis mb-2">
          {{ activeItem.summary }}
        </p>
      </div>

      <!-- 3. BULLET POINTS / STORY HIGHLIGHTS -->
      <div v-if="activeItem.bulletPoints?.length" class="bullet-list-box rounded pa-2 mb-3 bg-surface-variant cursor-pointer" @click="openStory(activeItem)">
        <div
          v-for="(pt, idx) in activeItem.bulletPoints"
          :key="idx"
          class="d-flex align-start gap-2 mb-1 last:mb-0"
        >
          <v-icon size="12" color="amber-accent-3" class="mt-1 flex-shrink-0">
            mdi-circle-small
          </v-icon>
          <span class="text-caption text-white-50 leading-snug">
            {{ pt }}
          </span>
        </div>
      </div>

      <!-- 4. ACTION BUTTONS & FOOTER -->
      <div class="mt-auto pt-2 border-t d-flex align-center justify-space-between">
        <span class="text-caption text-disabled">
          {{ activeItem.timestamp }}
        </span>

        <div class="d-flex align-center gap-2">
          <template v-if="activeItem.actions?.length">
            <v-btn
              v-for="act in activeItem.actions"
              :key="act.label"
              size="small"
              :color="act.color || 'primary'"
              variant="flat"
              class="font-weight-bold text-capitalize"
              :prepend-icon="act.icon || 'mdi-arrow-right'"
              :to="act.to"
              @click="handleAction(act)"
            >
              {{ act.label }}
            </v-btn>
          </template>
          <template v-else>
            <v-btn
              size="small"
              variant="tonal"
              color="amber-accent-3"
              prepend-icon="mdi-book-open-outline"
              @click="openStory(activeItem)"
            >
              Read Details
            </v-btn>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="d-flex flex-column align-center justify-center flex-grow-1 pa-6 text-center">
      <v-icon size="40" color="grey" class="mb-2">mdi-newspaper-variant-outline</v-icon>
      <span class="text-caption text-medium-emphasis">No media bulletins available in this category.</span>
    </div>

    <!-- 5. INTERACTIVE STORY & TRANSFER DOSSIER DIALOG -->
    <v-dialog v-model="isStoryDialogOpen" max-width="660px" scrollable>
      <v-card v-if="selectedStory" class="story-detail-dialog rounded-xl border elevation-12">
        <!-- Top Dialog Bar -->
        <v-card-title class="pa-4 d-flex align-center justify-space-between border-b bg-surface-variant-darker">
          <div class="d-flex align-center gap-2">
            <v-chip
              size="small"
              :color="selectedStory.badgeColor || 'amber-accent-3'"
              variant="flat"
              class="font-weight-black text-black text-uppercase"
            >
              {{ selectedStory.badge }}
            </v-chip>
            <span class="text-caption text-medium-emphasis">
              {{ selectedStory.timestamp }}
            </span>
          </div>
          <v-btn icon="mdi-close" size="small" variant="text" @click="isStoryDialogOpen = false" />
        </v-card-title>

        <v-card-text class="pa-5">
          <!-- CASE A: TRANSFER DOSSIER -->
          <template v-if="selectedStory.transferDetails">
            <!-- Player Spotlight Banner -->
            <div class="transfer-player-card rounded-lg pa-4 mb-4 elevation-3 position-relative overflow-hidden">
              <div class="d-flex align-center justify-space-between flex-wrap gap-2">
                <div>
                  <div class="text-caption text-uppercase font-weight-bold text-teal-accent-3 tracking-wider">
                    OFFICIAL TRANSFER DOSSIER
                  </div>
                  <div class="text-h5 font-weight-black text-white mt-1">
                    {{ selectedStory.transferDetails.playerName }}
                  </div>
                  <div class="d-flex align-center gap-2 mt-1 flex-wrap">
                    <v-chip size="x-small" color="primary" variant="flat" class="font-weight-black">
                      {{ selectedStory.transferDetails.position || 'PLAYER' }}
                    </v-chip>
                    <v-chip size="x-small" color="grey-darken-2" variant="flat" class="font-weight-bold text-white">
                      AGE {{ selectedStory.transferDetails.age }}
                    </v-chip>
                    <v-chip
                      size="x-small"
                      :color="selectedStory.transferDetails.rating && selectedStory.transferDetails.rating >= 80 ? 'amber-accent-3' : 'light-blue-accent-3'"
                      variant="tonal"
                      class="font-weight-black"
                    >
                      ⭐ OVR {{ selectedStory.transferDetails.rating }}
                    </v-chip>
                  </div>
                </div>

                <!-- Transfer Fee Highlight -->
                <div class="text-right">
                  <div class="text-caption text-medium-emphasis font-weight-bold text-uppercase">
                    Agreed Fee
                  </div>
                  <div class="text-h5 font-weight-black text-teal-accent-3">
                    {{ selectedStory.transferDetails.fee > 0 ? `€${selectedStory.transferDetails.fee.toLocaleString()}` : 'FREE TRANSFER' }}
                  </div>
                  <div class="text-caption text-disabled">
                    Valuation: €{{ (selectedStory.transferDetails.value || selectedStory.transferDetails.fee).toLocaleString() }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Transfer Route Cards: Where Transferred From -> Where Transferred To -->
            <div class="transfer-route-box rounded-lg pa-4 mb-4 bg-surface-variant border">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-3 text-center">
                TRANSFER TRANSACTION ROUTE
              </div>

              <div class="d-flex align-center justify-space-between gap-3">
                <!-- ORIGIN (WHERE FROM) -->
                <div class="route-club-col flex-1 pa-3 rounded text-center bg-surface-variant-darker border border-opacity-25">
                  <div class="text-caption font-weight-black text-teal-accent-2 mb-2 text-uppercase">
                    📤 TRANSFERRED FROM
                  </div>
                  <v-avatar size="56" class="crest-avatar mb-2 elevation-2">
                    <v-icon v-if="selectedStory.transferDetails.sellerClubCode" size="46">
                      custom:{{ selectedStory.transferDetails.sellerClubCode }}
                    </v-icon>
                    <v-icon v-else size="32" color="cyan-accent-3">mdi-account-arrow-left</v-icon>
                  </v-avatar>
                  <div class="text-subtitle-2 font-weight-black text-white line-height-tight">
                    {{ selectedStory.transferDetails.fromOrigin }}
                  </div>
                  <div class="text-caption text-disabled mt-1">
                    {{ selectedStory.transferDetails.sellerClubName ? 'Selling Club' : 'Previous Status' }}
                  </div>
                </div>

                <!-- ARROW -->
                <div class="d-flex flex-column align-center px-1">
                  <v-icon size="28" color="teal-accent-3" class="transfer-arrow-bounce">mdi-arrow-right-bold</v-icon>
                  <v-chip size="x-small" color="teal-accent-4" variant="flat" class="font-weight-black text-black mt-1">
                    SIGNED
                  </v-chip>
                </div>

                <!-- DESTINATION (WHERE TO) -->
                <div class="route-club-col flex-1 pa-3 rounded text-center bg-surface-variant-darker border border-opacity-25">
                  <div class="text-caption font-weight-black text-amber-accent-3 mb-2 text-uppercase">
                    📥 TRANSFERRED TO
                  </div>
                  <v-avatar size="56" class="crest-avatar mb-2 elevation-2">
                    <v-icon size="46">
                      custom:{{ selectedStory.transferDetails.buyerClubCode }}
                    </v-icon>
                  </v-avatar>
                  <div class="text-subtitle-2 font-weight-black text-white line-height-tight">
                    {{ selectedStory.transferDetails.toDestination }}
                  </div>
                  <div class="text-caption text-disabled mt-1">
                    Signing Club
                  </div>
                </div>
              </div>
            </div>

            <!-- Deal Specifications Grid -->
            <div class="deal-specs-grid rounded-lg pa-3 mb-4 bg-surface-variant border">
              <v-row dense>
                <v-col cols="6">
                  <div class="text-caption text-disabled font-weight-bold">DEAL TYPE</div>
                  <div class="text-caption font-weight-bold text-white">
                    {{ selectedStory.transferDetails.dealType || 'Permanent Transfer' }}
                  </div>
                </v-col>
                <v-col cols="6">
                  <div class="text-caption text-disabled font-weight-bold">ESTIMATED ANNUAL WAGE</div>
                  <div class="text-caption font-weight-bold text-white">
                    {{ selectedStory.transferDetails.wage ? `€${selectedStory.transferDetails.wage.toLocaleString()} / yr` : 'Undisclosed' }}
                  </div>
                </v-col>
                <v-col cols="6">
                  <div class="text-caption text-disabled font-weight-bold">REGISTRATION DATE</div>
                  <div class="text-caption font-weight-bold text-white">
                    {{ selectedStory.transferDetails.date || selectedStory.timestamp }}
                  </div>
                </v-col>
                <v-col cols="6">
                  <div class="text-caption text-disabled font-weight-bold">ORIGIN STATUS</div>
                  <div class="text-caption font-weight-bold text-teal-accent-3">
                    {{ selectedStory.transferDetails.sellerClubCode ? 'Domestic Club Transfer' : 'Free Agent Acquisition' }}
                  </div>
                </v-col>
              </v-row>
            </div>

            <!-- Executive Quote / Manager Reaction -->
            <div v-if="selectedStory.transferDetails.managerQuote" class="quote-box pa-3 rounded-lg mb-4 border border-opacity-25">
              <div class="d-flex align-start gap-2">
                <v-icon size="20" color="amber-accent-3" class="mt-1">mdi-format-quote-open</v-icon>
                <div>
                  <p class="text-caption text-white font-italic mb-1 leading-snug">
                    "{{ selectedStory.transferDetails.managerQuote }}"
                  </p>
                  <div class="text-caption font-weight-bold text-amber-accent-3">
                    &mdash; {{ selectedStory.transferDetails.buyerClubName }} Sporting Management
                  </div>
                </div>
              </div>
            </div>

            <!-- Tactical Scouting Verdict -->
            <div v-if="selectedStory.transferDetails.scoutingVerdict" class="scouting-box pa-3 rounded-lg mb-4 bg-surface-variant">
              <div class="text-caption font-weight-black text-uppercase text-teal-accent-3 mb-1">
                🔍 TACTICAL SCOUTING REPORT
              </div>
              <p class="text-caption text-medium-emphasis mb-0 leading-snug">
                {{ selectedStory.transferDetails.scoutingVerdict }}
              </p>
            </div>
          </template>

          <!-- CASE B: GENERAL NEWS / DERBY / SEASON FINALE READER -->
          <template v-else>
            <!-- Article Headline & Meta -->
            <div class="mb-4">
              <h2 class="text-h6 font-weight-black text-white leading-tight mb-2">
                {{ selectedStory.title }}
              </h2>
              <div class="text-caption text-medium-emphasis font-weight-medium">
                {{ selectedStory.subtitle }}
              </div>
            </div>

            <!-- Quote Block if present -->
            <div v-if="selectedStory.quote" class="quote-box pa-3 rounded-lg mb-4 border border-opacity-25">
              <div class="d-flex align-start gap-2">
                <v-icon size="20" color="amber-accent-3" class="mt-1">mdi-format-quote-open</v-icon>
                <div>
                  <p class="text-caption text-white font-italic mb-1 leading-snug">
                    "{{ selectedStory.quote.text }}"
                  </p>
                  <div class="text-caption font-weight-bold text-amber-accent-3">
                    &mdash; {{ selectedStory.quote.author }} ({{ selectedStory.quote.role }})
                  </div>
                </div>
              </div>
            </div>

            <!-- Key Takeaways / Bullet Points -->
            <div v-if="selectedStory.bulletPoints?.length" class="bullet-list-box rounded-lg pa-3 mb-4 bg-surface-variant">
              <div class="text-caption font-weight-black text-uppercase text-amber-accent-3 mb-2">
                KEY TAKEAWAYS &amp; DEVELOPMENTS
              </div>
              <div
                v-for="(pt, idx) in selectedStory.bulletPoints"
                :key="idx"
                class="d-flex align-start gap-2 mb-2 last:mb-0"
              >
                <v-icon size="14" color="amber-accent-3" class="mt-1 flex-shrink-0">
                  mdi-check-circle-outline
                </v-icon>
                <span class="text-caption text-white leading-snug">
                  {{ pt }}
                </span>
              </div>
            </div>

            <!-- Full Story Text -->
            <div class="story-body-text mb-4">
              <p class="text-body-2 text-medium-emphasis leading-relaxed" style="white-space: pre-line;">
                {{ selectedStory.fullStory || selectedStory.summary }}
              </p>
            </div>
          </template>
        </v-card-text>

        <!-- Dialog Footer Actions -->
        <v-card-actions class="pa-4 border-t bg-surface-variant-darker d-flex align-center justify-space-between">
          <v-btn variant="text" color="grey" @click="isStoryDialogOpen = false">
            Close
          </v-btn>

          <div class="d-flex align-center gap-2">
            <v-btn
              v-if="selectedStory.transferDetails"
              color="teal-accent-4"
              variant="flat"
              prepend-icon="mdi-swap-horizontal"
              to="/transfers"
              @click="isStoryDialogOpen = false"
            >
              Explore Transfer Market
            </v-btn>
            <template v-else-if="selectedStory.actions?.length">
              <v-btn
                v-for="act in selectedStory.actions"
                :key="act.label"
                size="small"
                :color="act.color || 'primary'"
                variant="flat"
                :prepend-icon="act.icon || 'mdi-arrow-right'"
                :to="act.to"
                @click="handleAction(act); isStoryDialogOpen = false"
              >
                {{ act.label }}
              </v-btn>
            </template>
          </div>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import type { Club, MediaItem } from '@repo/api-contract';
import { client } from '@/services/api';

const props = defineProps<{
  club: Club | null;
  selectedMatch?: any | null;
  selectedDay?: any | null;
  isMyClub?: boolean;
}>();

const router = useRouter();

interface ChannelOption {
  value: string;
  label: string;
  badge: string;
  desc: string;
  icon: string;
  color: string;
}

const channelOptions: ChannelOption[] = [
  {
    value: 'MY_CLUB',
    label: 'My League (EBSL)',
    badge: 'EBSL',
    desc: 'Epson Bellean Second League & Club Feed',
    icon: 'mdi-shield-star',
    color: 'amber-accent-3',
  },
  {
    value: 'EFL',
    label: 'EFL (First League)',
    badge: 'EFL',
    desc: 'Bellean First League Premier Circuit',
    icon: 'mdi-trophy-variant',
    color: 'light-blue-accent-2',
  },
  {
    value: 'KLV',
    label: 'KLV (Kev Vista)',
    badge: 'KLV',
    desc: 'Kev Leega Vista Top Flight',
    icon: 'mdi-soccer',
    color: 'teal-accent-3',
  },
  {
    value: 'KLS',
    label: 'KLS (Kev Seconda)',
    badge: 'KLS',
    desc: 'Kev Leega Seconda Championship',
    icon: 'mdi-shield-outline',
    color: 'deep-purple-accent-2',
  },
  {
    value: 'CCL',
    label: 'CCL (Champions League)',
    badge: 'CCL',
    desc: 'Continental Champions League Elite',
    icon: 'mdi-star-shooting',
    color: 'amber-lighten-2',
  },
  {
    value: 'OVERSEAS',
    label: '🌍 Overseas Dispatch',
    badge: 'GLOBAL',
    desc: 'World Leagues Wire & Foreign Free Agents',
    icon: 'mdi-earth',
    color: 'cyan-accent-3',
  },
];

const selectedChannel = ref<string>('MY_CLUB');
const selectedTypeFilter = ref<string>('all');
const currentIndex = ref(0);
const isLoading = ref(false);
const rawMediaItems = ref<MediaItem[]>([]);

// Story reader modal state
const isStoryDialogOpen = ref(false);
const selectedStory = ref<MediaItem | null>(null);

// Video simulation
const isVideoPlaying = ref(false);
const videoProgress = ref(0);
let videoInterval: any = null;

const currentChannelInfo = computed<ChannelOption>(() => {
  return (
    channelOptions.find((c) => c.value === selectedChannel.value) ??
    channelOptions[0]
  );
});

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function selectChannel(val: string) {
  selectedChannel.value = val;
  currentIndex.value = 0;
  fetchMediaFeed();
}

function openStory(item: MediaItem) {
  selectedStory.value = item;
  isStoryDialogOpen.value = true;
}

function countByType(type: string): number {
  return rawMediaItems.value.filter((i) => i.type === type).length;
}

function countByCategory(category: string): number {
  return rawMediaItems.value.filter((i) => i.category === category).length;
}

const filteredItems = computed<MediaItem[]>(() => {
  if (selectedTypeFilter.value === 'all') {
    return rawMediaItems.value;
  }
  if (selectedTypeFilter.value === 'transfer') {
    return rawMediaItems.value.filter((i) => i.category === 'transfer');
  }
  return rawMediaItems.value.filter((i) => i.type === selectedTypeFilter.value);
});

const activeItem = computed<MediaItem | null>(() => {
  if (!filteredItems.value.length) return null;
  return filteredItems.value[currentIndex.value] ?? filteredItems.value[0];
});

watch(selectedTypeFilter, () => {
  currentIndex.value = 0;
});

function nextItem() {
  if (currentIndex.value < filteredItems.value.length - 1) {
    currentIndex.value++;
  }
}

function prevItem() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  }
}

function handleAction(act: any) {
  const actionName = typeof act === 'string' ? act : act?.action;
  const to = typeof act === 'object' ? act?.to : undefined;

  if (actionName === 'open_story') {
    if (activeItem.value) {
      openStory(activeItem.value);
    }
  } else if (actionName === 'play_video') {
    simulatePlayVideo();
  } else if (to) {
    router.push(to);
  } else if (actionName === 'view_standings') {
    router.push('/league');
  } else if (actionName === 'squad_review') {
    router.push('/squadzone');
  } else if (actionName === 'view_transfers') {
    router.push('/transfers');
  }
}

function simulatePlayVideo() {
  isVideoPlaying.value = !isVideoPlaying.value;
  if (isVideoPlaying.value) {
    videoProgress.value = 0;
    if (videoInterval) clearInterval(videoInterval);
    videoInterval = setInterval(() => {
      videoProgress.value += 10;
      if (videoProgress.value >= 100) {
        isVideoPlaying.value = false;
        clearInterval(videoInterval);
      }
    }, 400);
  } else {
    if (videoInterval) clearInterval(videoInterval);
  }
}

async function fetchMediaFeed() {
  if (!props.club?._id) return;
  isLoading.value = true;
  try {
    const fixtureId = props.selectedMatch?._id ? String(props.selectedMatch._id) : undefined;
    const channel = selectedChannel.value !== 'MY_CLUB' ? selectedChannel.value : undefined;

    const res = await (client.clubs.getMediaFeed as any).query({
      params: { id: props.club._id },
      query: {
        fixtureId,
        channel,
      },
    });

    if (res.status === 200 && Array.isArray(res.body.payload)) {
      rawMediaItems.value = res.body.payload;
    } else {
      generateLocalFallback();
    }
  } catch (e) {
    generateLocalFallback();
  } finally {
    isLoading.value = false;
  }
}

/**
 * The press office couldn't be reached: say so plainly rather than inventing
 * stories that aren't about anything that happened.
 */
function generateLocalFallback() {
  rawMediaItems.value = [
    {
      id: 'media-offline',
      type: 'news',
      category: 'general',
      badge: '📡 OFFLINE',
      badgeColor: 'grey',
      title: 'The press office is unreachable',
      summary: 'Could not load the latest coverage. Try again in a moment.',
      timestamp: new Date().toISOString(),
    },
  ];
}

watch(
  () => [props.club?._id, props.selectedMatch?._id],
  () => {
    currentIndex.value = 0;
    fetchMediaFeed();
  },
  { immediate: true }
);

onUnmounted(() => {
  if (videoInterval) clearInterval(videoInterval);
});
</script>

<style scoped>
.general-media-card {
  background: #181926 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.bg-surface-variant-darker {
  background: rgba(0, 0, 0, 0.25);
}

.live-pulse-dot {
  width: 8px;
  height: 8px;
  background-color: #ff5252;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 8px #ff5252;
  animation: pulse 1.8s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 12px #ff5252; }
  100% { transform: scale(0.9); opacity: 0.8; }
}

.tune-icon {
  animation: radarBlink 2.5s infinite;
}

@keyframes radarBlink {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; filter: drop-shadow(0 0 4px #ffd54f); }
}

.season-champions-hero {
  background: linear-gradient(135deg, #3d2c02 0%, #1c1404 50%, #0d0a02 100%);
  border: 1px solid rgba(255, 193, 7, 0.45);
  box-shadow: inset 0 0 24px rgba(255, 179, 0, 0.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.season-champions-hero:hover {
  transform: translateY(-2px);
  box-shadow: inset 0 0 28px rgba(255, 179, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.4);
}

.champion-glow-ambient {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 140px;
  height: 90px;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.35) 0%, rgba(255, 215, 0, 0) 70%);
  pointer-events: none;
}

.champion-avatar {
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 215, 0, 0.6);
  box-shadow: 0 0 16px rgba(255, 193, 7, 0.4);
}

.crown-icon-badge {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.8));
}

.crown-pulse {
  animation: crownBob 2s infinite ease-in-out;
}

@keyframes crownBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

/* TRANSFER WIRE HERO */
.transfer-wire-hero {
  background: linear-gradient(135deg, #062b28 0%, #031715 50%, #020c0c 100%);
  border: 1px solid rgba(45, 212, 191, 0.4);
  box-shadow: inset 0 0 24px rgba(20, 184, 166, 0.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.transfer-wire-hero:hover {
  transform: translateY(-2px);
  box-shadow: inset 0 0 28px rgba(45, 212, 191, 0.4), 0 4px 16px rgba(0, 0, 0, 0.4);
}

.transfer-glow-ambient {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 140px;
  height: 90px;
  background: radial-gradient(circle, rgba(45, 212, 191, 0.35) 0%, rgba(45, 212, 191, 0) 70%);
  pointer-events: none;
}

.transfer-arrow-pulse {
  animation: arrowGlide 1.8s infinite ease-in-out;
}

@keyframes arrowGlide {
  0%, 100% { transform: translateX(0); opacity: 0.8; }
  50% { transform: translateX(4px); opacity: 1; filter: drop-shadow(0 0 6px #2dd4bf); }
}

.transfer-arrow-bounce {
  animation: arrowBounce 1.5s infinite ease-in-out;
}

@keyframes arrowBounce {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(5px); filter: drop-shadow(0 0 8px #2dd4bf); }
}

.story-summary-area {
  transition: background-color 0.2s ease;
}

.story-summary-area:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.story-summary-area:hover .hover-accent {
  color: #ffd54f !important;
}

.story-summary-area:hover .open-hint-icon {
  transform: scale(1.2);
}

.open-hint-icon {
  transition: transform 0.2s ease;
}

.line-height-tight {
  line-height: 1.2;
}

.derby-hero-banner {
  background: linear-gradient(135deg, #31103f 0%, #1a0826 100%);
  border: 1px solid rgba(255, 179, 0, 0.4);
  box-shadow: inset 0 0 20px rgba(255, 111, 0, 0.2);
  transition: transform 0.2s ease;
}

.derby-hero-banner:hover {
  transform: translateY(-2px);
}

.derby-fire-theme {
  background: linear-gradient(135deg, #3d0c02 0%, #1c051a 50%, #120324 100%) !important;
  border: 1px solid rgba(255, 87, 34, 0.5) !important;
}

.crest-avatar {
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.2);
  transition: transform 0.2s ease;
}

.crest-avatar:hover {
  transform: scale(1.08);
}

.vs-badge {
  text-shadow: 0 0 12px rgba(255, 179, 0, 0.6);
  letter-spacing: 2px;
}

.video-preview-banner {
  background: linear-gradient(135deg, #1c1024 0%, #0d0814 100%);
  border: 1px solid rgba(239, 68, 68, 0.3);
  min-height: 140px;
}

.play-btn-glow {
  filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.6));
  transition: transform 0.2s ease;
}

.play-btn-glow:hover {
  transform: scale(1.15);
}

.photo-preview-banner {
  background: linear-gradient(135deg, #092c24 0%, #051412 100%);
  border: 1px solid rgba(20, 184, 166, 0.3);
  min-height: 120px;
  position: relative;
}

.z-index-1 {
  position: relative;
  z-index: 1;
}

.bullet-list-box {
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.text-white-50 {
  color: rgba(255, 255, 255, 0.75);
}

.leading-tight {
  line-height: 1.25;
}

.leading-snug {
  line-height: 1.35;
}

/* DIALOG STYLING */
.story-detail-dialog {
  background: #181926 !important;
  color: #fff;
}

.transfer-player-card {
  background: linear-gradient(135deg, #08332f 0%, #051a18 100%);
  border: 1px solid rgba(45, 212, 191, 0.3);
}

.transfer-route-box {
  background: rgba(0, 0, 0, 0.3) !important;
}

.deal-specs-grid {
  background: rgba(255, 255, 255, 0.02) !important;
}

.quote-box {
  background: rgba(255, 179, 0, 0.06);
  border-left: 3px solid #ffb300 !important;
}

.scouting-box {
  background: rgba(45, 212, 191, 0.06);
  border-left: 3px solid #2dd4bf !important;
}
</style>
