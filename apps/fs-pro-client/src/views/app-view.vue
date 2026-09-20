<template>
  <v-app id="app">
    <v-navigation-drawer
      :modelValue="drawer"
      @update:modelValue="drawer = $event"
    >
      <v-list-item class="px-2 mt-2">
        <template v-slot:prepend>
          <v-avatar>
            <v-img
              :src="`${
                userMode
                  ? 'https://randomuser.me/api/portraits/women/84.jpg'
                  : 'https://randomuser.me/api/portraits/men/85.jpg'
              }`"
            ></v-img>
          </v-avatar>
        </template>

        <v-list-item-title>
          {{ userMode ? 'Manager' : 'Admin' }}
        </v-list-item-title>

        <template v-slot:append>
          <v-btn icon @click="show = !show">
            <v-icon>{{ show ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </v-btn>
        </template>
      </v-list-item>

      <v-expand-transition>
        <div v-show="show">
          <v-divider></v-divider>

          <v-list-item
            class="px-2 grey-darken-4"
            :to="`${!userMode ? '/u' : '/a'}`"
            link
          >
            <template v-slot:prepend>
              <v-avatar>
                <v-img
                  :src="`${
                    !userMode
                      ? 'https://randomuser.me/api/portraits/women/84.jpg'
                      : 'https://randomuser.me/api/portraits/men/85.jpg'
                  }`"
                ></v-img>
              </v-avatar>
            </template>

            <v-list-item-title>
              {{ !userMode ? 'Manager' : 'Admin' }}
            </v-list-item-title>
          </v-list-item>
        </div>
      </v-expand-transition>

      <v-divider></v-divider>
      <v-list density="compact">
        <v-list-item
          v-for="item in navItems"
          :key="item.title"
          :to="item.link"
          :exact="true"
          link
        >
          <template v-slot:prepend>
            <v-icon v-if="item.type == 'club-logo'">
              {{ `custom:${item.icon}` }}
            </v-icon>
            <v-icon v-else :color="item.color">{{ item.icon }}</v-icon>
          </template>

          <v-list-item-title>{{ item.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar density="compact" elevation="2" v-if="!MatchZone" class="app-top-bar" color="#0c0e15">
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <img class="mr-2 ml-1" width="30px" :src="`/logo-new.png`" />

      <!-- Top Bar Ticker Component (Competition, Treasury, Date, World Events, Persona) -->
      <top-bar-ticker
        :socket-connected="socketConnected"
        @logout="logout"
      />
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <router-view></router-view>
      </v-container>
    </v-main>

    <v-snackbar
      :modelValue="toast.show"
      @update:modelValue="toast.show = $event"
      :timeout="3000"
      :color="toast.style"
    >
      {{ toast.message }}
    </v-snackbar>

    <!-- TODO: clean this up! -->
    <v-overlay
      :modelValue="errorOverlay"
      @update:modelValue="errorOverlay = $event"
    >
      <v-sheet class="text-center pa-2" width="500px" height="300px">
        Error!
        <br />
        <v-btn color="green" @click="goBackToPreviousState">Go Back</v-btn>
      </v-sheet>
    </v-overlay>

    <!-- <v-footer app>
      <v-row dir="row">

        <v-col col="12">
          <span>&copy; {{ new Date().getFullYear() }} Leankhan &amp; Tobi</span>
        </v-col>
      </v-row>
    </v-footer> -->
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute, onBeforeRouteUpdate } from 'vue-router';
import { useStore } from '@/store';
import { client, apiUrl } from '@/services/api';
import { appSocket } from '@/services/socket';
import TopBarTicker from '@/components/navigation/top-bar-ticker.vue';

const router = useRouter();
const route = useRoute();
const store = useStore();

const drawer = ref(true);
const show = ref(false);
const socketIsConnected = ref(appSocket.connected);

const adminNavItems = ref<any[]>([
  { title: 'Home', icon: 'mdi-soccer', link: '/a', color: 'primary' },
  { title: 'Clubs', icon: 'mdi-security', link: '/a/clubs', color: 'amber' },
  {
    title: 'Calendar',
    icon: 'mdi-calendar',
    link: '/a/calendar',
    color: 'indigo',
  },
  {
    title: 'Players',
    icon: 'mdi-account',
    link: '/a/players',
    color: 'indigo',
  },
  {
    title: 'Competitions',
    icon: 'mdi-trophy',
    link: '/a/competitions',
    color: 'yellow',
  },
  {
    title: 'Managers',
    icon: 'mdi-account',
    link: '/a/managers',
    color: 'cyan',
  },
]);

const logout = async (): Promise<void> => {
  try {
    const response = await client.users.logoutUser.mutation({
      params: { id: user.value.userID },
    });
    console.log('Response => ', response.body);
    if (response.status === 200) {
      appSocket.disconnect();
      store.unsetUser();
      if (import.meta.env.VITE_IMAGINATION_LOGIN === 'true') {
        // End the Imagination session too; it sends the browser back to the login page.
        window.location.assign(`${apiUrl}/api/auth/logout`);
        return;
      }
      router.push('/auth');
    }
  } catch (error) {
    console.log('Error logging out! ', error);
  }
};

const goBackToPreviousState = (): void => {
  store.toggleErrorOverlay();
  router.back();
};

const user = computed(() => {
  return store.user;
});

const errorOverlay = computed(() => {
  return store.errorOverlay;
});

const toast = computed(() => {
  return store.toast;
});

const socketConnected = computed(() => {
  return socketIsConnected.value;
});

const userNavItems = computed((): any[] => {
  let routes = [
    { title: 'Home', icon: 'mdi-soccer', link: '/u', color: 'primary' },
    {
      title: 'Year Calendar',
      icon: 'mdi-calendar-month',
      link: '/u/calendar',
      color: 'indigo',
    },
    {
      title: 'Season History',
      icon: 'mdi-history',
      link: '/u/history',
      color: 'amber',
    },
  ];

  if (
    user.value &&
    user.value.clubs &&
    typeof user.value.clubs[0] == 'object'
  ) {
    console.log('Clubs dey');
    const clubRoutes = user.value.clubs.map((club: any) => {
      return {
        title: club.Name,
        icon: `${club.ClubCode}`,
        link: `/u/clubs/${club._id}/${club.ClubCode}`,
        color: 'pink darken-2',
        type: 'club-logo',
      };
    });

    routes = [...routes, ...clubRoutes];
  }

  // Add settings link at the end
  routes.push({
    title: 'Settings',
    icon: 'mdi-cog',
    link: '/u/settings',
    color: 'grey',
  });

  return routes;
});

const userMode = computed((): boolean => {
  return route.path.split('/')[1] == 'u';
});

const MatchZone = computed((): boolean => {
  return route.name == 'MatchZone';
});

const navItems = computed(() => {
  if (!userMode.value) {
    return adminNavItems.value;
  }

  return userNavItems.value;
});

/** Re-establish a session when the cookie wasn't sent back. Currently
 * unreachable: `User` never carries a `session`/sessionID field client-side
 * (deliberately - the session id is a cookie-transport concern, not
 * something the client should hold in JS), so the guard below always
 * returns early. Ported as-is rather than fixed - reviving this properly
 * is an architecture decision (would mean exposing a session id to the
 * client again), not a small on-the-line fix. */
const enter = async (): Promise<void> => {
  const sessionID = (user.value as { session?: string }).session;
  if (!user.value?.userID || !sessionID) return;

  const userID = user.value.userID;

  console.log('user => ', user.value);

  try {
    const response = await client.users.enterSession.mutation({
      body: { userID, sessionID },
    });
    if (response.status === 200) {
      store.setUser({ ...user.value });
    }
  } catch (error) {
    console.log('Error entering in! ', error);
  }
};

onBeforeRouteUpdate((to, from, next) => {
  if (to.name == 'MatchZone') {
    drawer.value = false;
  } else {
    drawer.value = true;
  }
  next();
});

onMounted(() => {
  if (MatchZone.value) {
    drawer.value = false;
  }

  store.getUser();
  store.getCountries();

  enter();

  appSocket.on('connect', handleSocketConnect);
  appSocket.on('disconnect', handleSocketDisconnect);
  appSocket.connect();
});

onUnmounted(() => {
  appSocket.off('connect', handleSocketConnect);
  appSocket.off('disconnect', handleSocketDisconnect);
});

function handleSocketConnect() {
  socketIsConnected.value = true;
}

function handleSocketDisconnect() {
  socketIsConnected.value = false;
}
</script>
