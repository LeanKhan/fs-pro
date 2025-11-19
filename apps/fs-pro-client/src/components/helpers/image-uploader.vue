<!-- Upload an Image to the Server.-->
<template>
  <div>
    <v-card
      :class="card.class"
      ripple
      @click="selectImage"
      flat
      :height="card.height"
      :style="card.style"
      :width="card.width"
      :title="card.title"
      light
    >
      <!-- class: mt-3 mx-auto d-flex justify-center -->
      <v-card-title>{{ card.title || 'Upload Image' }}</v-card-title>
      <v-sheet
        v-if="!uploadedImage"
        :class="cardSheet.class"
        color="secondary-lighten-3"
        :style="cardSheet.style"
        :height="cardSheet.height"
        :width="cardSheet.width"
      >
        <div class="text-center mx-auto">
          <v-icon color="white">mdi-photo</v-icon>
          <!-- <p class="body mt-2 white--text">
                    Circle Avatar
                  </p> -->
        </div>
      </v-sheet>

      <!-- Put this instead of Sheet when an image is uploaded :) -->

      <v-img
        v-else
        :src="uploadedImage"
        :cover="previewImage.contain"
        :height="previewImage.height"
        :width="previewImage.width"
        :style="previewImage.style"
      ></v-img>
      <!-- style: border-radius: 50px -->
    </v-card>
    <v-card-actions>
      <v-btn
        variant="text"
        color="pink"
        :loading="uploading"
        :disabled="!image"
        v-show="image"
        @click="upload"
      >
        Upload
      </v-btn>

      <v-file-input
        accept="image/png, image/jpeg, image/gif, image/bmp, image/svg"
        placeholder="Pick an image"
        prepend-icon="mdi-image"
        ref="imageUploader"
        class="d-none"
        @change="imageUploaded"
        label="Photo"
      >
        <template v-slot:default>
          <v-btn>Select file!</v-btn>
        </template>
      </v-file-input>
    </v-card-actions>
    <!-- Native Image input field -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance } from 'vue';
import { useStore } from '@/store';

interface PreviewImage {
  height: string;
  width: string;
  style: string;
  src: string;
  contain: boolean;
}

interface CardSheet {
  height: string;
  width: string;
  class: string;
  style: string;
}

interface Card {
  height: string;
  width: string;
  class: string;
  style: string;
  title: string;
}

interface Props {
  previewImage?: PreviewImage;
  cardSheet?: CardSheet;
  card?: Card;
  compress?: boolean;
  filePath: string;
  fileName: string;
}

const props = withDefaults(defineProps<Props>(), {
  previewImage: () => ({
    height: '',
    width: '',
    style: '',
    src: '',
    contain: false,
  }),
  cardSheet: () => ({
    height: '300px',
    width: '245px',
    class: '',
    style: '',
  }),
  card: () => ({
    height: '300px',
    width: '245px',
    class: '',
    style: '',
    title: 'Upload Image',
  }),
  compress: true,
});

const emit = defineEmits<{
  'uploaded-image-src': [src: string];
  'update:image': [file: File];
}>();

const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;
const store = useStore();

const image = ref<File | null>(null);
const uploadedImageSrc = ref<any>('');
const uploading = ref(false);
const imageUploader = ref();

const uploadedImage = computed(() => {
  if (uploadedImageSrc.value) {
    return uploadedImageSrc.value;
  } else {
    return props.previewImage.src || '';
  }
});

const selectImage = () => {
  const fileInput = imageUploader.value?.$refs?.input as HTMLInputElement;
  if (fileInput) {
    fileInput.click();
  }
};

const imageUploaded = async (file: File) => {
  if (file) {
    image.value = file;

    const reader = new FileReader();

    reader.addEventListener('load', async (e) => {
      uploadedImageSrc.value = e.target!.result as string;
      emit('uploaded-image-src', uploadedImageSrc.value);
    });

    reader.readAsDataURL(file);
    emit('update:image', file);

    // TODO: add it back but only for image posts.
    // const image = await compressAccurately(file, 500);
    // const image = await compress(file, 0.5);
    // console.log('Image =>', image);
    // emit('update:image', image);
  }
};

const upload = () => {
  const headers = {
    'Content-Type': 'multipart/form-data',
  };

  uploading.value = true;

  const formData = new FormData();
  formData.append('image', image.value as File);

  $axios
    .post(
      `/files/upload?filename=${props.fileName}&filepath=${props.filePath}`,
      formData,
      {
        headers,
      }
    )
    .then((response: any) => {
      console.log('res => ', response.data);
    })
    .catch((response: any) => {
      console.log('res => ', response.data);

      store.showToast({
        message: 'Error uploading image',
        style: 'error',
      });
    })
    .finally(() => {
      uploading.value = false;
      image.value = null;
    });
};
</script>

<style></style>
