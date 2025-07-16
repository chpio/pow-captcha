import {
	WORKER_READY,
	type WorkerRequest,
	type WorkerResponse,
} from "./shared";
import { arrayStartsWith, chunkArray } from "../utils";

export async function solveJs(
	nonce: Uint8Array,
	target: Uint8Array,
	difficultyBits: number,
): Promise<Uint8Array> {
	if (target.length < Math.ceil(difficultyBits / 8)) {
		throw new Error(`pow-captcha: target is smaller than difficultyBits`);
	}

	const arr = new Uint8Array(8 + nonce.byteLength);
	const solutionView = new DataView(arr.buffer, 0, 8);
	arr.set(nonce, 8);

	const targetWholeBytes = target.slice(0, Math.floor(difficultyBits / 8));

	let targetRest: null | [number, number] = null;
	const targetRestBits = difficultyBits % 8;
	if (targetRestBits !== 0) {
		const mask = (0xff << (8 - targetRestBits)) & 0xff;
		const rest = target[targetWholeBytes.length]! & mask;
		targetRest = [mask, rest];
	}

	for (
		let i = BigInt(0);
		// eslint-disable-next-line no-constant-condition
		true;
		i++
	) {
		// using little-endian
		solutionView.setBigUint64(0, i, true);

		const hashArrayBuf = await crypto.subtle.digest("SHA-256", arr);
		const hash = new Uint8Array(hashArrayBuf);

		if (arrayStartsWith(hash, targetWholeBytes)) {
			if (
				targetRest === null ||
				(hash[targetWholeBytes.length]! & targetRest[0]) ===
					targetRest[1]
			) {
				return new Uint8Array(
					solutionView.buffer,
					solutionView.byteOffset,
					solutionView.byteLength,
				);
			}
		}
	}
}

export async function solveChallenges({
	challenges,
	engine,
	difficultyBits,
}: WorkerRequest): Promise<Array<Uint8Array>> {
	const workerChallenges = chunkArray(
		Math.floor(challenges.length / navigator.hardwareConcurrency),
		challenges,
	);

	console.log("workerChallenges", workerChallenges);

	const workers = workerChallenges.map(async (challenges) => {
		const worker = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		});

		try {
			// await worker ready
			await new Promise<void>((onOk, onErr) => {
				worker.onerror = onErr;
				worker.onmessage = (m) => {
					if (m.data !== WORKER_READY) {
						onErr(
							new Error(
								`pow-captcha: Worker-ready ("${WORKER_READY}") expected, got: "${m.data}"`,
							),
						);
					} else {
						onOk();
					}
				};
			});

			const resultPromise = new Promise<ReadonlyArray<Uint8Array>>(
				(onOk, onErr) => {
					worker.onerror = onErr;
					worker.onmessage = (m: MessageEvent<WorkerResponse>) => {
						console.log("worker msg", m);
						onOk(m.data.solutions);
					};
				},
			);

			const req: WorkerRequest = { challenges, engine, difficultyBits };
			worker.postMessage(req);

			return await resultPromise;
		} finally {
			worker.terminate();
		}
	});

	return (await Promise.all(workers)).flat();
}

export async function verify(
	nonce: Uint8Array,
	target: Uint8Array,
	difficultyBits: number,
	solution: Uint8Array,
): Promise<boolean> {
	if (target.length < Math.ceil(difficultyBits / 8)) {
		throw new Error(`pow-captcha: target is smaller than difficultyBits`);
	}

	const arr = new Uint8Array(solution.byteLength + nonce.byteLength);
	arr.set(solution);
	arr.set(nonce, solution.byteLength);

	const hashArrayBuf = await crypto.subtle.digest("SHA-256", arr);
	const hash = new Uint8Array(hashArrayBuf);

	const targetWholeBytes = target.slice(0, Math.floor(difficultyBits / 8));

	if (!arrayStartsWith(hash, targetWholeBytes)) {
		return false;
	}

	const targetRestBits = difficultyBits % 8;
	if (targetRestBits === 0) {
		return true;
	}

	const mask = (0xff << (8 - targetRestBits)) & 0xff;
	const rest = target[targetWholeBytes.length]! & mask;
	return (hash[targetWholeBytes.length]! & mask) === rest;
}
