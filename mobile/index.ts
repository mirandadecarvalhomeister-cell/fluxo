import { registerGlobals } from '@livekit/react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Necessário antes de qualquer uso do LiveKit no React Native.
registerGlobals();

registerRootComponent(App);
