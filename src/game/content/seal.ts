/**
 * The rulebook's code seal: the pool program the rulebook describes, named
 * by the hash of its code.
 *
 * The hash is the one `solana-verify` prints, the SHA-256 of the program
 * without the zero bytes after it. A build of solana-tsv at `commit` gives
 * it (`solana-verify get-executable-hash`), and so does a chain that runs
 * that build (`solana-verify get-program-hash`): the same hash means the
 * deployed code is the published code. The game prints the seal and checks
 * nothing; update the hash and the commit together when the pool program
 * changes in solana-tsv.
 */
export const CODE_SEAL = {
    program: 'cpmm-pool',
    hash: '0b681015f5fd173c627c488612b1d149f7761fcd6aa01ffebe996ee358c9348d',
    commit: '805e6ab',
    /** Where the venue's own comparison of deployed programs with the build stands. */
    standing: 'In review · solana-tsv#138',
} as const;
