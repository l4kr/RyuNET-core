if ((process as any).pkg) process.env.NODE_ENV = 'production';

import { Logger } from './utils/Logger';
import { ARGS, CONFIG, ReadConfig, SaveConfig } from './utils/ArgConfig';
import { services } from './eamuse';
import { VERSION } from './utils/Consts';
import { pad } from 'lodash';
import express from 'express';
import chalk from 'chalk';
import { LoadExternalPlugins } from './eamuse/ExternalPluginLoader';
import { webui } from './webui/index';
import path from 'path';
import { ASSETS_PATH, LoadCoreDB, SeedDefaultAdmin } from './utils/EamuseIO';
import { initLiveFeedStore } from './utils/LiveFeedStore';
import { getSdvxMusicRoots, prewarmJacketRoots } from './utils/sdvx_jacket_resolver';
import open from 'open';
import { Migrate } from './utils/migration';
import { StartDiscordBot } from './discord/bot';
import { LOG_FILE_PATH } from './utils/Logger';

// Any failure here previously died as a silent unhandled rejection/exception
// -- never reaching Logger (so nothing in log.txt), and easy to miss on a
// terminal or invisible entirely under a process manager. Log everything,
// loudly, to both console and log.txt, no matter where it happens.
process.on('unhandledRejection', (reason: any) => {
  Logger.error('[fatal] Unhandled rejection during startup/runtime:');
  Logger.error(reason && reason.stack ? reason.stack : String(reason));
});
process.on('uncaughtException', (err: any) => {
  Logger.error('[fatal] Uncaught exception:');
  Logger.error(err && err.stack ? err.stack : String(err));
});

function isIPv6(ip: string) {
  return !!/(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/.test(
    ip
  );
}

function cleanIP(ip: string) {
  if (ip.startsWith('[') && ip.endsWith(']')) {
    return ip.substr(1, ip.length - 2);
  }
  return ip;
}

function Main() {
  ReadConfig();

  process.title = `${CONFIG.server_name || 'Asphyxia Core'} ${VERSION}`;

  initLiveFeedStore();

  Logger.info('                        _                _        ');
  Logger.info('        /\\             | |              (_)      ');
  Logger.info('       /  \\   ___ _ __ | |__  _   ___  ___  __ _ ');
  Logger.info("      / /\\ \\ / __| '_ \\| '_ \\| | | \\ \\/ / |/ _` |");
  Logger.info('     / ____ \\\\__ \\ |_) | | | | |_| |>  <| | (_| |');
  Logger.info('    /_/    \\_\\___/ .__/|_| |_|\\__, /_/\\_\\_|\\__,_|');
  Logger.info('                 | |           __/ |     __   __   __   ___ ');
  Logger.info('                 |_|          |___/     /  ` /  \\ |__) |__  ');
  Logger.info('                                        \\__, \\__/ |  \\ |___ ');
  Logger.info('');
  Logger.info(chalk.cyanBright(pad(`${CONFIG.server_tag || 'CORE'} ${VERSION}`, 60)));
  Logger.info(pad(`Brought you by Team Asphyxia | Modified by Beafowl & Ryu7w7`, 60));
  Logger.info(` `);
  Logger.info(chalk.redBright(pad(`FREE SOFTWARE. BEWARE OF SCAMMERS.`, 60)));
  Logger.info(pad(`If you bought this software, request refund immediately.`, 60));
  Logger.info(` `);
  if (ARGS.dev) {
    Logger.info(`Log file: ${LOG_FILE_PATH}`);
    Logger.info(` `);
  }

  const EAMUSE = express();

  EAMUSE.set('trust proxy', 1);
  EAMUSE.disable('etag');
  EAMUSE.disable('x-powered-by');

  if (ARGS.dev) {
    Logger.info(` [Developer Mode] Console Output Enabled`);
    Logger.info(``);
  }

  const external = LoadExternalPlugins();
  SaveConfig();

  // SDVX plugin config (Game Data Directory) is now loaded, so jacket
  // roots can be resolved -- pre-warm the directory listing cache before
  // the first request so /live-feed and profile pages never block on a
  // synchronous directory scan.
  void prewarmJacketRoots();

  process.title = `${CONFIG.server_name || 'Asphyxia Core'} ${VERSION} | Plugins: ${external.length
    }`;
  if (external.length <= 0) {
    Logger.warn(chalk.yellowBright('no plugins are installed.'));
    Logger.info('');
  }

  // ========== EAMUSE ============
  EAMUSE.set('views', path.join(ASSETS_PATH, 'views'));
  EAMUSE.set('view engine', 'pug');
  EAMUSE.use('*', services(CONFIG.port, external));
  EAMUSE.use('/static', express.static(path.join(ASSETS_PATH, 'static')));
  const UPLOADS_PATH = path.join((process as any).pkg ? path.dirname(process.argv0) : process.cwd(), 'uploads');
  EAMUSE.use('/uploads', express.static(UPLOADS_PATH));
  
  // Custom, Omnimix, and Official local jackets support via Express.
  // Roots are derived automatically from the SDVX plugin's own Game Data
  // Directory config (see sdvx_jacket_resolver.ts); sdvx_music_root /
  // sdvx_custom_music_root remain as manual overrides for unusual setups.
  // Long cache lifetime speeds up repeat loads since jackets rarely change.
  for (const root of getSdvxMusicRoots()) {
    EAMUSE.use('/jackets/sdvx', express.static(root, { maxAge: '7d', immutable: true }));
  }

  EAMUSE.use(webui);

  // ========== LISTEN ============
  const server = EAMUSE.listen(CONFIG.port, CONFIG.bind, () => {
    const cleaned = cleanIP(CONFIG.bind);
    const isV6 = isIPv6(cleaned);
    const printAddr = isV6 ? `[${cleaned}]` : cleaned;
    const removeNIC = cleaned.split('%')[0];
    const openAddr =
      cleaned == '0.0.0.0' || cleaned == '::' || cleaned == '0:0:0:0:0:0:0:0'
        ? 'localhost'
        : isV6
          ? `[${removeNIC}]`
          : removeNIC;

    Logger.info(``);
    const serverInfo = `${printAddr} at ${CONFIG.port}`;
    const httpInfo = `http://${openAddr}:${CONFIG.port}`;
    Logger.info(`   +=============== Server Started ===============+`);
    Logger.info(`   | - Listening - - - - - - - - - - - - - - - - -|`);
    Logger.info(`   |${pad(serverInfo, 46)}|`);
    Logger.info(`   | - WebUI - - - - - - - - - - - - - - - - - - -|`);
    Logger.info(`   |${pad(httpInfo, 46)}|`);
    Logger.info(`   +==============================================+`);
    Logger.info('');

    if (CONFIG.webui_on_startup) {
      try {
        open(`http://${openAddr}:${CONFIG.port}`);
      } catch { }
    }

    // Discord bot runs in isolation — any failure must NEVER crash the game server
    StartDiscordBot().catch(err => {
      Logger.error(`[Discord] Fatal error during bot startup (server is unaffected): ${err}`);
    });
  });

  server.on('error', (err: any) => {
    if (err && err.code == 'EADDRINUSE') {
      Logger.info('Server failed to start: port might be in use.');
      Logger.info('Use -p argument to change port.');
    }
    Logger.info(' ');
    Logger.error(`     ${err.message}`);
    Logger.info(' ');
    Logger.info('Press any key to exit.');
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 0));
  });
}

Migrate().then(() => {
  LoadCoreDB()
    .then(() => SeedDefaultAdmin())
    .then(Main)
    .catch((err) => {
      Logger.error('[fatal] Startup failed after Migrate (LoadCoreDB/SeedDefaultAdmin/Main):');
      Logger.error(err && err.stack ? err.stack : String(err));
    });
}).catch((err) => {
  Logger.error('[fatal] Migrate() failed - server did not start:');
  Logger.error(err && err.stack ? err.stack : String(err));
});
