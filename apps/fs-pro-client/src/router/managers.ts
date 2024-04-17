import { RouteConfig } from 'vue-router';
import ManagersHome from '@/views/admin/managers/dashboard.vue';
import ViewManager from '@/views/admin/managers/view-manager.vue';
import ManagerForm from '@/views/admin/managers/manager-form.vue';
import ManagerHome from '@/views/admin/managers/manager-home.vue';

const routes: RouteConfig = {
  path: 'managers',
  component: () =>
    import(
      /* webpackChunkName: "managers" */ '../views/admin/managers/managers-home.vue'
    ),
  children: [
    {
      path: '',
      component: ManagersHome,
      name: 'Managers Home',
      meta: { title: 'Home' },
    },
    {
      path: 'new',
      name: 'New Manager',
      component: ManagerForm,
      meta: { title: 'New Manager' },
    },
    {
      path: ':id/',
      component: ManagerHome,
      children: [
        {
          path: '',
          component: ViewManager,
          name: 'View Manager',
          meta: { title: 'View Manager' },
        },
        {
          path: 'update',
          name: 'Update Manager',
          component: ManagerForm,
          meta: { title: 'Update Manager' },
          props: { isUpdate: true },
        },
      ],
    },
  ],
};

export default routes;
