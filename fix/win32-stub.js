/**
 * Inert stand-in for the koffi FFI module on non-Windows platforms.
 *
 * dsh-win32-process only calls into koffi from the Win32 subprocess runner,
 * which can never execute on Linux/macOS. The problem is import time:
 * koffi.struct() registers layout names in a process-global registry, so
 * loading a second physical copy of this module throws
 * "Duplicate type name 'DSH_STARTUPINFOW'". npm leaves several physical
 * copies in the tree when prerelease ranges (^0.1.5-rc.3, as declared by
 * dsh-subprocess-local / dsh-sandbox-windows-acl 0.1.5-rc.3) cannot be
 * satisfied by an installed prerelease of a lower tag (0.1.5-rc.2, the only
 * runtime dsh-telegram-duty's peers allow), so the duplicate load is not
 * hypothetical — it kills `dsh web` on every boot.
 *
 * The stub mirrors only the shape module-scope code touches at import time:
 * pointer()/struct() return opaque layout descriptors, and struct() records
 * the size the ABI guards below expect.
 */
function createKoffiStub() {
	const registry = new Map();
	const layout = (name) => {
		if (registry.has(name)) return registry.get(name);
		const value = { name, size: name === "DSH_STARTUPINFOW" ? 104 : name === "DSH_PROCESS_INFORMATION" ? 24 : 0 };
		registry.set(name, value);
		return value;
	};
	const stub = new Proxy(
		{
			alloc: () => Buffer.alloc(8),
			free: () => {},
			decode: () => 0n,
			encode: () => {},
			load: () => ({})
		},
		{
			get(target, prop, receiver) {
				if (prop in target) return Reflect.get(target, prop, receiver);
				if (prop === "pointer") return (type) => layout(`ptr:${typeof type === "string" ? type : type?.name ?? "anon"}`);
				if (prop === "struct") return (name, fields) => layout(name);
				return () => layout("anon");
			}
		}
	);
	return stub;
}

export { createKoffiStub };
