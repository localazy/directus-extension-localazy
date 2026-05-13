import { defineModule } from '@directus/extensions-sdk';
import AdvancedSettings from './AdvancedSettings.vue';
import ProjectSetup from './ProjectSetup.vue';
import Sync from './Sync.vue';
import Overview from './Overview.vue';
import About from './About.vue';
import Activity from './Activity.vue';
import ActivityDetail from './ActivityDetail.vue';
import Automation from './Automation.vue';
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
      path: 'activity',
      component: Activity,
    },
    {
      path: 'activity/:sessionId',
      component: ActivityDetail,
    },
    {
      path: 'automation',
      component: Automation,
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
    if (getConfig().APP_MODE === 'demo') {
      return true;
    }
    return user.admin_access === true;
  },
});
