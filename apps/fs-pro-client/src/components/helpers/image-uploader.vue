<!-- Upload an Image to the Server. Thank you Jesus! -->
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
        color="secondary lighten-3"
        :style="cardSheet.style"
        :height="cardSheet.height"
        :width="cardSheet.width"
      >
        <div class="text-center mx-auto">
          <v-icon color="white">
            mdi-photo
          </v-icon>
          <!-- <p class="body mt-2 white--text">
                    Circle Avatar
                  </p> -->
        </div>
      </v-sheet>

      <!-- Put this instead of Sheet when an image is uploaded :) -->

      <v-img
        v-else
        :src="uploadedImage"
        :contain="previewImage.contain"
        :height="previewImage.height"
        :width="previewImage.width"
        :style="previewImage.style"
      ></v-img>
      <!-- style: border-radius: 50px -->
    </v-card>
    <v-card-actions>
      <v-btn
        text
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

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
// import { Club } from '@/interfaces/club';
// import { apiUrl } from '@/store';
@Component({})
export default class ImageUploader extends Vue {
  @Prop({
    required: false,
    default: () => ({
      height: '',
      width: '',
      style: '',
      src: '',
      contain: false,
    }),
  })
  readonly previewImage!: {
    height: string;
    width: string;
    style: string;
    src: string;
    contain: boolean;
  };

  @Prop({
    required: false,
    default: () => ({
      height: '300px',
      width: '245px',
      class: '',
      style: '',
    }),
  })
  readonly cardSheet!: {};

  @Prop({
    required: false,
    default: () => ({
      height: '300px',
      width: '245px',
      class: '',
      style: '',
      title: 'Upload Image',
    }),
  })
  readonly card!: {};

  @Prop({ required: false, default: true }) readonly compress!: boolean;

  @Prop({ required: true, type: String }) readonly filePath!: string;
  @Prop({ required: true, type: String }) readonly fileName!: string;

  private image: File | null = null;
  private uploadedImageSrc: any = '';
  private uploading = false;

  get uploadedImage() {
    if(this.uploadedImageSrc){
    return this.uploadedImageSrc;
    } else {
      return this.previewImage.src || '';
    }
  }

  set uploadedImage(src) {
    this.previewImage.src = src;
  }

  private selectImage() {
    const fileUploader = this.$refs.imageUploader as Vue;

    const fileInput = fileUploader.$refs.input as HTMLInputElement;
    fileInput.click();
  }

  private async imageUploaded(file: File) {
    if (file) {
      this.image = file;

      const reader = new FileReader();

      reader.addEventListener('load', async e => {
        this.uploadedImageSrc = e.target!.result as string;
        this.$emit('uploaded-image-src', this.uploadedImageSrc);

        // reader.readAsDataURL(file);

        // this.$emit('update:image', image);
      });

      reader.readAsDataURL(file);
      this.$emit('update:image', file);

      // TODO: add it back but only for image posts.

      // const image = await compressAccurately(file, 500);

      // const image = await compress(file, 0.5);

      // console.log('Image =>', image);

      // this.$emit('update:image', image);
    }
  }

  private upload() {
    const headers = {
      'Content-Type': 'multipart/form-data',
    };

    this.uploading = true;

    const formData = new FormData();

    formData.append('image', this.image as File);

    this.$axios
      .post(
        `/files/upload?filename=${this.fileName}&filepath=${this.filePath}`,
        formData,
        {
          headers,
        }
      )
      .then(response => {
        console.log('res => ', response.data);

        // this.image = undefined;

        // this.uploadedImage = '';
      })
      .catch(response => {
        console.log('res => ', response.data);

        this.$store.dispatch('SHOW_TOAST', {
          message: 'Error uploading image',
          style: 'error',
        });
      })
      .finally(() => {
        this.uploading = false;
        this.image = null;
      });
  }
}
</script>

<style></style>
