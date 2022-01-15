<template>
  <div>
    <!-- Inset form here!  -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber darken-1">
            <v-btn icon @click="goBack">
              <v-icon>
                mdi-arrow-left
              </v-icon>
            </v-btn>

            <v-toolbar-title class="ml-1">
              {{ isUpdate ? 'Update Club' : 'Create Club' }}
            </v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="3">
        <!-- <v-card height="300" width="245">
          <v-card-title>
            {{ form.Name ? form.Name : 'Club Name' }}
          </v-card-title>

          <v-card class="mt-3" ripple @click="upload" flat :loading="uploading">
            <v-img
              v-if="isUpdate && !uploadedImage"
              :src="`${api}/img/clubs/logos/${form.ClubCode}.png`"
              height="300px"
            ></v-img>
            <v-sheet
              v-else-if="!uploadedImage && !isUpdate"
              class="d-flex align-center"
              color="secondary lighten-3"
              height="300"
            >
              <div class="text-center mx-auto">
                <v-icon color="white" x-large>
                  mdi-camera
                </v-icon>
                <p class="body mt-2 white--text">
                  Upload Image
                </p>
              </div>
            </v-sheet>
            <v-img v-else :src="uploadedImage" height="300px"></v-img>
          </v-card>

          <v-card-actions>
            <v-btn
              text
              color="pink"
              :loading="uploading"
              :disabled="!form.ClubCode"
              @click="uploadLogo"
            >
              Upload
            </v-btn>

            <v-file-input
              accept="image/png, image/jpeg, image/gif, image/bmp, imge/svg"
              placeholder="Upload Club Logo"
              prepend-icon="mdi-photo"
              ref="fileUploader"
              class="d-none"
              @change="imageUploaded"
              label="Logo"
            >
              <template v-slot:default>
                <v-btn>Select file!</v-btn>
              </template>
            </v-file-input>
          </v-card-actions>
        </v-card> -->

        <!-- lol sorry! -->
        <image-uploader
          v-if="form.ClubCode"
          v-bind:card="{
            title: 'Upload Club Logo',
            class: 'mb-3',
            height: 'auto',
          }"
          v-bind:cardSheet="{ height: 'auto' }"
          v-bind:previewImage="{
            src: isUpdate ? `${api}/img/clubs/logos/${form.ClubCode}.png` : '',
            contain: true,
          }"
          :fileName="form.ClubCode"
          :filePath="'/clubs/logos/'"
        ></image-uploader>

        <image-uploader
          v-if="form.ClubCode"
          v-bind:card="{ title: 'Upload Club Kit', height: 400 }"
          v-bind:cardSheet="{ height: 400 }"
          v-bind:previewImage="{
            src: isUpdate
              ? `${api}/img/clubs/kits/${form.ClubCode}-kit.png`
              : '',
            contain: true,
          }"
          :fileName="`${form.ClubCode}-kit`"
          :filePath="'/clubs/kits/'"
        ></image-uploader>
      </v-col>

      <v-col cols="9">
        <v-form @submit.prevent="submit">
          <v-card>
            <!-- <v-toolbar flat color="amber darken-1">
          <v-toolbar-title>
            Create Club
          </v-toolbar-title>
        </v-toolbar> -->

            <v-container>
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    color="amber darken-1"
                    label="Name"
                    v-model="form.Name"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="amber darken-1"
                    label="Code"
                    v-model="form.ClubCode"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <div class="subtitle-1">Stadium</div>
                  <div class="d-flex flex-column">
                    <v-text-field
                      color="amber darken-1"
                      label="Name"
                      v-model="form.Stadium.Name"
                    ></v-text-field>

                    <v-text-field
                      color="amber darken-1"
                      label="Capacity"
                      v-model="form.Stadium.Capacity"
                    ></v-text-field>

                    <v-text-field
                      color="amber darken-1"
                      label="Location"
                      v-model="form.Stadium.Location"
                    ></v-text-field>
                  </div>
                </v-col>

                <v-col class="px-2" cols="6">
                  <div class="subtitle-1">Address</div>
                  <div class="d-flex flex-column">
                    <v-text-field
                      color="amber darken-1"
                      label="Section"
                      v-model="form.Address.Section"
                    ></v-text-field>

                    <v-text-field
                      color="amber darken-1"
                      label="City"
                      v-model="form.Address.City"
                    ></v-text-field>

                    <v-select
                      color="amber darken-1"
                      label="Country"
                      :items="countries"
                      item-text="Name"
                      item-value="_id"
                      v-model="form.Address.Country"
                    ></v-select>
                  </div>
                </v-col>
              </v-row>
            </v-container>

            <v-divider></v-divider>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                @click="submit"
                :color="`${isUpdate ? 'warning' : 'success'}`"
              >
                {{ isUpdate ? 'Update' : 'Create Club' }}
              </v-btn>

              <v-btn @click="$router.push('../clubs')" color="secondary">
                Cancel
              </v-btn>

              <v-btn v-if="isUpdate" @click="deleteClub" color="error">
                Remove
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-form>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Club } from '@/interfaces/club';
import { apiUrl } from '@/store';
import ImageUploader from '@/components/helpers/image-uploader.vue';

@Component({
  components: {
    ImageUploader,
  },
})
export default class ClubForm extends Vue {
  @Prop({ required: false }) readonly isUpdate!: boolean;
  private club: {} = {};

  private image!: File | undefined;

  private api: string = apiUrl;

  private uploadedImage: any = '';

  private form: any = {
    Name: '',
    ClubCode: '',
    Manager: '',
    Address: {
      Section: '',
      City: '',
      Country: '',
    },
    Stadium: {
      Name: '',
      Capacity: '',
      Location: '',
    },
  };

  // TODO: upload files to server!

  // public countries: string[] = [
  //   'Ashter',
  //   'Bellean',
  //   'UPP',
  //   'Kiyoto',
  //   'Ekhastan',
  // ];

  private uploading = false;

  get countries(): string[] {
    return this.$store.getters.countries;
  }

  private upload() {
    const fileUploader = this.$refs.fileUploader as Vue;

    const fileInput = fileUploader.$refs.input as HTMLInputElement;
    fileInput.click();
  }

  private uploadLogo() {
    const headers = {
      'Content-Type': 'multipart/form-data',
    };

    this.uploading = true;

    const formData = new FormData();

    formData.append('image', this.image as File);

    const path = JSON.stringify('/clubs/logos');

    const clubCode = this.form.ClubCode;

    this.$axios
      .post(`/files/upload?club_code=${clubCode}&path=${path}`, formData, {
        headers,
      })
      .then(response => {
        console.log('res => ', response.data);

        // this.image = undefined;

        // this.uploadedImage = '';
      })
      .catch(response => {
        console.log('res => ', response.data);
      })
      .finally(() => {
        this.uploading = false;
      });
  }

  private imageUploaded(file: File) {
    this.image = file;

    const reader = new FileReader();

    reader.addEventListener('load', e => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.uploadedImage = e.target!.result;
    });

    reader.readAsDataURL(file);
  }

  private mounted(): void {
    if (this.isUpdate) {
      const clubID = this.$route.params['id'];
      // const clubCode = this.$route.params['code'];
      this.$axios
        .get(`/clubs/${clubID}`)
        .then(response => {
          this.club = response.data.payload as Club;
          this.form = response.data.payload as Club;
        })
        .catch(response => {
          console.log('Response => ', response);
        });
    }
  }

  private submit(): void {
    const clubID = this.$route.params['id'];

    const url = this.isUpdate ? `/clubs/${clubID}/update` : '/clubs/new';

    this.$axios
      .post(url, { data: this.form })
      .then(response => {
        console.log('Response => ', response);
        this.$router.push({ name: 'Clubs Home' });
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }

  private goBack() {
    this.$router.back();
  }

  private deleteClub() {
    const answer = confirm(
      'Are you sure you want to delete ' + this.form.Name + '?!!'
    );

    if (answer) {
      const clubID = this.$route.params['id'];

      this.$axios
        .delete(`/clubs/${clubID}`)
        .then(response => {
          console.log('Successfully deleted Club => ', response);
          this.$router.push({ name: 'Clubs Home' });
        })
        .catch(response => {
          console.log('Error deleting comp =>', response.data);
        });
    }
  }
}
</script>

<style></style>
