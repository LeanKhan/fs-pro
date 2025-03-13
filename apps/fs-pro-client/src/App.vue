<template>
  <router-view></router-view>
</template>

<script setup lang="ts">
import { useTheme } from 'vuetify';

const theme = useTheme();

// Set dark theme and colors
theme.global.name.value = 'dark';
theme.themes.value.dark.colors.primary = '#7535ed';
theme.themes.value.dark.colors.accent = '#c23361';
theme.themes.value.dark.colors.anchor = '#340f78';
</script>