// All automated tests are offline by default. Individual tests may provide an explicit mock.
globalThis.fetch=(...args)=>{throw new Error("Real network access is disabled during tests: "+String(args[0]));};
