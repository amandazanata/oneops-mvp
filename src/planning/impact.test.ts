import assert from "node:assert/strict";
import test from "node:test";

import {
  createCarlosUnavailableEvent,
  createRecoveryFixture,
} from "../domain/fixture.ts";
import { analyzeImpact } from "./impact.ts";

test("finds three direct orders and OS-105 in the causal frontier", () => {
  const impact = analyzeImpact(
    createRecoveryFixture(),
    createCarlosUnavailableEvent(),
  );

  assert.deepEqual(impact.directOrderIds, ["OS-102", "OS-104", "OS-106"]);
  assert.deepEqual(impact.indirectOrderIds, ["OS-105"]);
});

test("emits a typed accessible chain from the event to the indirect order", () => {
  const impact = analyzeImpact(
    createRecoveryFixture(),
    createCarlosUnavailableEvent(),
  );

  const frontier = impact.nodes.find(
    ({ type, entityId, relation }) =>
      type === "FRONTIER" &&
      entityId === "OS-105" &&
      relation === "ENTERS_FRONTIER",
  );
  assert.ok(frontier?.parentId);
  const blocker = impact.nodes.find(({ id }) => id === frontier.parentId);
  assert.deepEqual(
    blocker && {
      type: blocker.type,
      entityId: blocker.entityId,
      relation: blocker.relation,
    },
    {
      type: "ORDER",
      entityId: "OS-105",
      relation: "BLOCKS_CANDIDATE",
    },
  );
});

test("does not put the locked OS-101 in the indirect frontier", () => {
  const impact = analyzeImpact(
    createRecoveryFixture(),
    createCarlosUnavailableEvent(),
  );

  assert.equal(impact.indirectOrderIds.includes("OS-101"), false);
});
