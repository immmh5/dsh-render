const name = "dsh-arabic";
const inject = [];

//#region host half
/** Language pack: every translation lives in the browser half (lib/client.js),
* which registers the `ar` locale and its dictionaries with the client locale
* service. The host half only exists so the bundle row has a module to mount.
* @param ctx - Cordis plugin context.
*/
function apply(ctx) {}
//#endregion

export { apply, inject, name };
