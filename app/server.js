/* eslint-disable no-console */

import bodyParser from 'body-parser';
import compression from 'compression';
import express from 'express';

import helmet from 'helmet';
import { Server } from 'http';
import mongoose from 'mongoose';
import path from 'path';

import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';

import { TaskProvider } from 'shared/tasks/tasks';
import { OcrManager } from 'api/services/ocr/OcrManager';
import { PDFSegmentation } from 'api/services/pdfsegmentation/PDFSegmentation';
import { DistributedLoop } from 'api/services/tasksmanager/DistributedLoop';

import { appContextMiddleware } from 'api/utils/appContextMiddleware';
import { requestIdMiddleware } from 'api/utils/requestIdMiddleware';
import uwaziMessage from '../message';
import apiRoutes from './api/api';
import privateInstanceMiddleware from './api/auth/privateInstanceMiddleware';
import authRoutes from './api/auth/routes';
import { config } from './api/config';
import vaultSync from './api/evidences_vault';

import { migrator } from './api/migrations/migrator';
import settings from './api/settings';
import syncWorker from './api/sync/syncWorker';
import errorHandlingMiddleware from './api/utils/error_handling_middleware';
import { handleError } from './api/utils/handleError.js';
import { Repeater } from './api/utils/Repeater';
import serverRenderingRoutes from './react/server.js';
import { DB } from './api/odm';
import { tenants } from './api/tenants/tenantContext';
import { multitenantMiddleware } from './api/utils/multitenantMiddleware';
import { staticFilesMiddleware } from './api/utils/staticFilesMiddleware';
import { customUploadsPath, uploadsPath } from './api/files/filesystem';
import { tocService } from './api/toc_generation/tocService';
import { permissionsContext } from './api/permissions/permissionsContext';
import { routesErrorHandler } from './api/utils/routesErrorHandler';
import { closeSockets } from './api/socketio/setupSockets';

mongoose.Promise = Promise;

const app = express();
if (config.sentry.dsn) {
  Sentry.init({
    dsn: config.sentry.dsn,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
    ],
    tracesSampleRate: config.sentry.tracesSampleRate,
  });
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

routesErrorHandler(app);
app.use(helmet());

const http = Server(app);

const uncaughtError = error => {
  handleError(error, { uncaught: true });
  throw error;
};

process.on('unhandledRejection', uncaughtError);
process.on('uncaughtException', uncaughtError);

const oneYear = 31557600;

let maxage = 0;
if (app.get('env') === 'production') {
  maxage = oneYear;
}

app.use(compression());
app.use(express.static(path.resolve(__dirname, '../dist'), { maxage }));
app.use('/public', express.static(config.publicAssets));
app.use(/\/((?!remotepublic).)*/, bodyParser.json({ limit: '1mb' }));

app.use(appContextMiddleware);

//////
// this middleware should go just before any other that accesses to db
app.use(multitenantMiddleware);
//////
app.use(requestIdMiddleware);
let dbAuth = {};

if (process.env.DBUSER) {
  dbAuth = {
    auth: { authSource: 'admin' },
    user: process.env.DBUSER,
    pass: process.env.DBPASS,
  };
}

console.info('==> Connecting to', config.DBHOST);
DB.connect(config.DBHOST, dbAuth).then(async () => {
  await tenants.setupTenants();
  authRoutes(app);
  app.use(privateInstanceMiddleware);
  app.use('/flag-images', express.static(path.resolve(__dirname, '../dist/flags')));
  app.use('/assets/:fileName', staticFilesMiddleware([customUploadsPath]));
  app.use(
    '/uploaded_documents/:fileName',
    staticFilesMiddleware([
      uploadsPath,
      // retained for backwards compatibility
      customUploadsPath,
      //
    ])
  );
  apiRoutes(app, http);
  serverRenderingRoutes(app);
  if (config.sentry.dsn) {
    app.use(Sentry.Handlers.errorHandler());
  }
  app.use(errorHandlingMiddleware);

  if (!config.multiTenant && !config.clusterMode) {
    await tenants.run(async () => {
      const shouldMigrate = await migrator.shouldMigrate();
      if (shouldMigrate) {
        console.error(
          '\x1b[33m%s\x1b[0m',
          '==> Your database needs to be migrated, please run:\n\n yarn migrate & yarn reindex\n\n'
        );
        process.exit(1);
      }
    });
  }

  const bindAddress = { true: 'localhost' }[process.env.LOCALHOST_ONLY];
  const port = config.PORT;

  http.listen(port, bindAddress, async () => {
    await tenants.run(async () => {
      permissionsContext.setCommandContext();
      if (!config.multiTenant && !config.clusterMode) {
        syncWorker.start();

        const { evidencesVault, features } = await settings.get();
        if (evidencesVault && evidencesVault.token && evidencesVault.template) {
          console.info('==> 📥  evidences vault config detected, started sync ....');
          const vaultSyncRepeater = new Repeater(
            () => vaultSync.sync(evidencesVault.token, evidencesVault.template),
            10000
          );
          vaultSyncRepeater.start();
        }

        if (features && features.tocGeneration && features.tocGeneration.url) {
          console.info('==> 🗂️ automatically generating TOCs using external service');
          const service = tocService(features.tocGeneration.url);
          const tocServiceRepeater = new Repeater(() => service.processNext(), 10000);
          tocServiceRepeater.start();
        }

        const anHour = 3600000;
        const topicClassificationRepeater = new Repeater(
          () =>
            TaskProvider.runAndWait('TopicClassificationSync', 'TopicClassificationSync', {
              mode: 'onlynew',
              noDryRun: true,
              overwrite: true,
            }),
          anHour
        );
        topicClassificationRepeater.start();

        if (config.externalServices) {
          console.info('==> 📡  starting external segmentation service ....');
          const segmentationConnector = new PDFSegmentation();
          const segmentationRepeater = new DistributedLoop(
            'segmentation_repeat',
            segmentationConnector.segmentPdfs,
            { port: config.redis.port, host: config.redis.host, delayTimeBetweenTasks: 2000 }
          );

          segmentationRepeater.start();
        }
      }

      if (config.externalServices) {
        OcrManager.start();
      }
    });

    console.info(
      '==> 🌎 Listening on port %s. Open up http://localhost:%s/ in your browser.',
      port,
      port
    );

    if (process.env.HOT) {
      console.info('');
      console.info('==> 📦 webpack is watching...');
      console.info(uwaziMessage);
    }
  });

  process.on('SIGINT', () => {
    process.stdout.write('SIGINT signal received.\r\n');
    http.close(error => {
      process.stdout.write('Gracefully closing express connections\r\n');
      if (error) {
        process.stderr.write(error.toString());
        process.exit(1);
      }

      DB.disconnect().then(() => {
        process.stdout.write('Disconnected from database\r\n');
        process.stdout.write('Server closed succesfully\r\n');
        process.exit(0);
      });
    });
    closeSockets();
  });
});
