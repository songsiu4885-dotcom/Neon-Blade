import { defineConfig } from 'vite';

// 상대 경로로 빌드해서 https://<계정>.github.io/<저장소>/ 같은 하위 주소에서도 동작한다
export default defineConfig({ base: './' });
