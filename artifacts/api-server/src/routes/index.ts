import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dhruvaRouter from "./dhruva";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dhruvaRouter);

export default router;
