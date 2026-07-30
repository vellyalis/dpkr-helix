import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fixedPickerScript, WindowsFolderPicker, type SpawnAdapter } from "./folder-picker.js";

const unsupported = new WindowsFolderPicker("linux");
assert.equal(await unsupported.isSupported(), false);
assert.equal(await unsupported.chooseDirectory(), undefined);

let observedCommand = "";
let observedArgs: string[] = [];
const spawnOk: SpawnAdapter = (command, args) => {
  observedCommand = command;
  observedArgs = args;
  const child = fakeChild();
  queueMicrotask(() => {
    (child.stdout as PassThrough).end("C:\\Users\\developer\\devspace\r\n");
    child.emit("close", 0);
  });
  return child;
};
const picker = new WindowsFolderPicker("win32", spawnOk);
assert.equal(await picker.chooseDirectory(), "C:\\Users\\developer\\devspace");
assert.equal(observedCommand, "powershell.exe");
assert.deepEqual(observedArgs, ["-NoProfile", "-STA", "-EncodedCommand", fixedPickerScript()]);

const spawnCancel: SpawnAdapter = () => {
  const child = fakeChild();
  queueMicrotask(() => {
    (child.stdout as PassThrough).end("");
    child.emit("close", 0);
  });
  return child;
};
assert.equal(await new WindowsFolderPicker("win32", spawnCancel).chooseDirectory(), undefined);

const spawnFail: SpawnAdapter = () => {
  const child = fakeChild();
  queueMicrotask(() => {
    (child.stderr as PassThrough).end("failed details\n");
    child.emit("close", 1);
  });
  return child;
};
await assert.rejects(
  () => new WindowsFolderPicker("win32", spawnFail).chooseDirectory(),
  /failed details/,
);

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill(): boolean;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child as unknown as ReturnType<SpawnAdapter>;
}
