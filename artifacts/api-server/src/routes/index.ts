import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dhruvaRouter from "./dhruva";
import ideationRouter from "./ideation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dhruvaRouter);
router.use(ideationRouter);

export default router;
