import { Router, type IRouter } from "express";
import healthRouter from "./health";
import extractRouter from "./extract";
import reportsRouter from "./reports";
import dashboardRouter from "./dashboard";
import { comercialRouter } from "./comercial";
import clientsRouter from "./clients";
import geotabRouter from "./geotab";
import authRouter from "./auth";
import subcontratosRouter from "./subcontratos";
import revisionRouter from "./revision";
import gestionRouter from "./gestion";
import diagnosticsRouter from "./diagnostics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(diagnosticsRouter);
router.use(authRouter);
router.use(extractRouter);
router.use(reportsRouter);
router.use(revisionRouter);
router.use(dashboardRouter);
router.use(comercialRouter);
router.use(clientsRouter);
router.use(geotabRouter);
router.use(subcontratosRouter);
router.use(gestionRouter);

export default router;
