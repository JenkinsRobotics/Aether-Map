// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { emptyShow } from './document';
import { routeToPlayer } from './deploy-to-player';
import { deploymentReadiness } from './deployment-readiness';

it('adds an output for a player that has none, bound to the active scene', () => {
  const show = emptyShow();
  const routed = routeToPlayer(show, 'pi', 'Porch');
  expect(routed).not.toBe(show);
  expect(routed.outputs.at(-1)).toMatchObject({ kind: 'edge', deviceId: 'pi', name: 'Porch', sceneId: show.activeSceneId });
  expect(deploymentReadiness(routed, 'pi').blockers).toEqual([]);
});

it('leaves a show that already routes to the player unchanged', () => {
  const show = emptyShow();
  const routed = routeToPlayer(show, 'pi', 'Porch');
  expect(routeToPlayer(routed, 'pi', 'Porch')).toBe(routed);
});
