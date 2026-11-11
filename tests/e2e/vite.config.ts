import { mergeConfig } from 'vite';
import base from '../../vite.config';

// Browser fixtures exercise same-origin session cookies through a local proxy only.
export default mergeConfig(base, { server: { proxy: { '/api': 'http://localhost:4010' } } });
