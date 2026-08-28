import 'dotenv/config';

import { criarApp } from './app';

const PORT = process.env.PORT || 3000;

criarApp().listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
