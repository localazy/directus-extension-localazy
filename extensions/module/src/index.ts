import { defineModule } from '@directus/extensions-sdk';
import AdvancedSettings from './AdvancedSettings.vue';
import ProjectSetup from './ProjectSetup.vue';
import Sync from './Sync.vue';
import Overview from './Overview.vue';
import About from './About.vue';
import { getConfig } from '../../common/config/get-config';

export default defineModule({
  id: 'localazy',
  name: 'Localazy',
  icon: 'translate',
  color: '#066fef',
  routes: [
    {
      path: '',
      redirect: '/localazy/overview',
    },
    {
      path: 'overview',
      component: Overview,
    },
    {
      path: 'actions',
      component: Sync,
    },
    {
      path: 'additional-settings',
      component: AdvancedSettings,
    },
    {
      path: 'project-setup',
      component: ProjectSetup,
    },
    {
      path: 'about',
      component: About,
    },
  ],
  preRegisterCheck(user) {
    return user.role?.admin_access === true || getConfig().APP_MODE === 'demo';
  },
});
