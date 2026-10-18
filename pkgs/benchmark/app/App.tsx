import * as powCaptcha from "@pow-captcha/pow-captcha";
import { useCallback, useState } from "react";
import type { Route } from "./+types/App";

export async function loader() {
	const challenge = await powCaptcha.server.createChallengesRaw({
		difficultyBits: 19,
		challengeCount: 64,
	});

	return { challenge };
}

export default function App({
	loaderData: { challenge },
}: Route.ComponentProps) {
	const [durationJs, setDurationJs] = useState<null | string>(null);
	const [durationWasm, setDurationWasm] = useState<null | string>(null);

	const run = useCallback(
		async (
			engine: "wasm" | "js",
			setter: React.Dispatch<React.SetStateAction<string | null>>,
		) => {
			try {
				setter(`Running`);

				const challenges = challenge.challenges.map(
					(challenge) =>
						[
							powCaptcha.wire.deserializeArray(challenge[0]),
							powCaptcha.wire.deserializeArray(challenge[1]),
						] as const,
				);

				const start = performance.now();
				await powCaptcha.solver.solveChallenges({
					difficultyBits: challenge.difficultyBits,
					challenges,
					engine,
				});
				const duration = performance.now() - start;

				setter(`${duration.toFixed(1)}ms`);
			} catch (err) {
				setter(`Error: ${err}`);
			}
		},
		[challenge],
	);

	const runJs = useCallback(async () => {
		await run("js", setDurationJs);
	}, [run]);

	const runWasm = useCallback(async () => {
		await run("wasm", setDurationWasm);
	}, [run]);

	return (
		<div>
			<h1>pow-captcha Benchmark</h1>
			Results:
			<table>
				<thead>
					<tr>
						<th>type</th>
						<th>duration</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>wasm</td>
						<td>{durationWasm}</td>
						<td>
							<button onClick={runWasm}>run</button>
						</td>
					</tr>
					<tr>
						<td>js</td>
						<td>{durationJs}</td>
						<td>
							<button onClick={runJs}>run</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
