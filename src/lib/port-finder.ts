// Copy pasted drection from playground-tools
// https://github.com/WordPress/playground-tools/blob/ef3c6d030bac39502664f1514acba3c21576d9b1/packages/wp-now/src/port-finder.ts#L1

import http from 'http';

const DEFAULT_PORT = 8881;

class PortFinder {
	static #instance: PortFinder;
	#searchPort = DEFAULT_PORT;
	#openPort: number | null = null;

	private constructor() {
		// empty so it can be set private
	}

	public static getInstance(): PortFinder {
		if ( ! PortFinder.#instance ) {
			PortFinder.#instance = new PortFinder();
		}
		return PortFinder.#instance;
	}

	#incrementPort(): number {
		return ++this.#searchPort;
	}

	#isPortFree(): Promise< boolean > {
		return new Promise( ( resolve ) => {
			const server = http.createServer();

			server
				.listen( this.#searchPort, () => {
					server.close();
					resolve( true );
				} )
				.on( 'error', () => {
					resolve( false );
				} );
		} );
	}

	/**
	 * Returns the first available open port, caching and reusing it for subsequent calls.
	 *
	 * @returns {Promise<number>} A promise that resolves to the open port number.
	 */
	public async getOpenPort( portToStart?: number ): Promise< number > {
		this.#searchPort = portToStart ? portToStart : this.#openPort ?? DEFAULT_PORT;

		while ( ! ( await this.#isPortFree() ) ) {
			this.#incrementPort();
		}

		const port = this.#searchPort;
		this.#openPort = this.#incrementPort();
		return port;
	}

	public setPort( port: number ): void {
		this.#openPort = port;
	}
}

export const portFinder = PortFinder.getInstance();
