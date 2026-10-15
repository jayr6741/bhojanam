import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
const router = Router();
router.use('/health', healthRoutes);
// Mount feature routers here as each existing POS API is migrated.
export default router;
