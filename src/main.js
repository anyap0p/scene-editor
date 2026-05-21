import { mount } from 'svelte';
import App from './App.svelte';
import PreviewPopout from './PreviewPopout.svelte';
import './app.css';
import { isPopoutMode } from './lib/previewSync';

const target = document.getElementById('app');
const Component = isPopoutMode() ? PreviewPopout : App;
mount(Component, { target });
