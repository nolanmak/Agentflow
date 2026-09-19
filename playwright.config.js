import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test/browser',timeout:45000,use:{baseURL:'http://127.0.0.1:4317',headless:true,permissions:['microphone'],launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']}}});
