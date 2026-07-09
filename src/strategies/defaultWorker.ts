/**
 * This file is adapted from discord.js and includes additional modifications.
 *
 * Original Apache 2.0 license:
 * https://github.com/discordjs/discord.js/blob/3d6121589f9c0d91f7cf4976307e8be07053a277/LICENSE
 */
import { WorkerBootstrapper } from "../utils/worker.js";

const bootstrapper = new WorkerBootstrapper();
void bootstrapper.bootstrap();
