import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// Expo Go든 네이티브 dev client든 이 한 줄로 환경이 맞춰진다.
registerRootComponent(App);
