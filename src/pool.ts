import { Program } from "@coral-xyz/anchor";
import { BN, BorshCoder } from '@project-serum/anchor';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {PumpSwap, IDL} from "./IDL";
import { connection } from "./constants";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
const PUMP_AMM_PROGRAM_ID: PublicKey = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL_TOKEN_ACCOUNT: PublicKey = new PublicKey('So11111111111111111111111111111111111111112');
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_PROGRAM_ID_PUBKEY = new PublicKey(PUMP_PROGRAM_ID);
const program = new Program(IDL, {
    connection,
  });


interface Pool {
  address: PublicKey;
  is_native_base: boolean;
  poolData: any;
}

interface PoolWithPrice extends Pool {
    price: number;
    reserves: {
        native: number;
        token: number;
    }
}

const getPoolsWithBaseMint = async (mintAddress: PublicKey) => {
    let response=null , is_err=true,cnt=0;;
    
    while(is_err){
      if(cnt>=20) break;
      try{
        response = await connection.getProgramAccounts(PUMP_AMM_PROGRAM_ID, {
            filters: [
                {
                  "memcmp": {
                    "offset": 43,
                    "bytes": mintAddress.toBase58()
                  }
                }
              ]
            }
        )
        if(response.length > 0) {
          
          is_err = false;
        }else{
          console.log("no data returned, retrying...")
        }
        console.log(response);
      }catch(err){
        is_err = true
      }
      cnt++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const mappedPools = response.map((pool) => {
        const data = Buffer.from(pool.account.data);
        const poolData = program.coder.accounts.decode('pool', data);
        return {
            address: pool.pubkey,
            is_native_base: false,
            poolData
        };
    })

    return mappedPools;
}

const getPoolsWithQuoteMint = async (mintAddress: PublicKey) => {
    const response = await connection.getProgramAccounts(PUMP_AMM_PROGRAM_ID, {
        filters: [
            { "dataSize": 211 },
            {
              "memcmp": {
                "offset": 75,
                "bytes": mintAddress.toBase58()
              }
            }
          ]
        }
    )

    const mappedPools = response.map((pool) => {
        const data = Buffer.from(pool.account.data);
        const poolData = program.coder.accounts.decode('pool', data);
        return {
            address: pool.pubkey,
            is_native_base: true,
            poolData
        };
    })

    return mappedPools;
}

const getPoolsWithBaseMintQuoteWSOL = async (mintAddress: PublicKey) => {
    const response = await connection.getProgramAccounts(PUMP_AMM_PROGRAM_ID, {
        filters: [
            { "dataSize": 211 },
            {
              "memcmp": {
                "offset": 43,
                "bytes": mintAddress.toBase58()
              }
            },
            {
                "memcmp": {
                  "offset": 75,
                  "bytes": WSOL_TOKEN_ACCOUNT.toBase58()
                }
            }
          ]
        }
    )

    const mappedPools = response.map((pool) => {
        const data = Buffer.from(pool.account.data);
        const poolData = program.coder.accounts.decode('pool', data);
        return {
            address: pool.pubkey,
            is_native_base: true,
            poolData
        };
    })

    return mappedPools;
}

export const getPriceAndLiquidity = async (pool: Pool) => {
    const wsolAddress = pool.poolData.poolQuoteTokenAccount;
    const tokenAddress = pool.poolData.poolBaseTokenAccount;
    let wsolBalance, tokenBalance;
    let is_err = true, cnt=0;
    while(is_err){
      if(cnt>=10) break;
      try{
        wsolBalance = await connection.getTokenAccountBalance(wsolAddress);
        tokenBalance = await connection.getTokenAccountBalance(tokenAddress);
        is_err = false;
      }catch(err){
        is_err = true;
      }
      cnt++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const price = wsolBalance.value.uiAmount! / tokenBalance.value.uiAmount!;

    return {
        ...pool,
        price,
        reserves: {
            native: wsolBalance.value.uiAmount!,
            token: tokenBalance.value.uiAmount!
        }
    } as PoolWithPrice;
}
export const getPoolsWithPrices = async (mintAddress: PublicKey) => {
    const [poolsWithBaseMint] = await Promise.all([
        getPoolsWithBaseMint(mintAddress),
        //getPoolsWithQuoteMint(mintAddress)
    ])
    //const poolsWithBaseMinQuoteWSOL = await getPoolsWithBaseMintQuoteWSOL(mintAddress)
    const pools = [...poolsWithBaseMint];

    const results = await Promise.all(pools.map(getPriceAndLiquidity));

    const sortedByHighestLiquidity = results.sort((a, b) => b.reserves.native - a.reserves.native);

    return sortedByHighestLiquidity;
}
export const calculateWithSlippageBuy = (
    amount: bigint,
    basisPoints: bigint
  ) => {
    return amount - (amount * basisPoints) / 10000n;
  };
export const getBuyTokenAmount = async (solAmount: bigint, mint:PublicKey) => {
    const pool_detail = await getPoolsWithPrices(mint);
    // console.log(pool_detail)
    const sol_reserve = BigInt(Math.floor(pool_detail[0].reserves.native *LAMPORTS_PER_SOL));
    const token_reserve = BigInt(Math.floor(pool_detail[0].reserves.token * 10**6));
    const product = sol_reserve * token_reserve;
    let new_sol_reserve = sol_reserve + solAmount;
    let new_token_reserve = product / new_sol_reserve + 1n;
    // console.log(new_token_reserve);
    let amount_to_be_purchased = token_reserve - new_token_reserve;

    return amount_to_be_purchased;
}

export const getSnipePumpTokenAmount = async (solAmount: bigint, mint:PublicKey) => {
  const pool_detail = await getPoolsWithPrices(mint);
  const sol_reserve = BigInt(Math.floor(pool_detail[0].reserves.native *LAMPORTS_PER_SOL));
  if(pool_detail[0].reserves.native >= 150){
    throw new Error("Reserves too high");
  }
  const token_reserve = BigInt(Math.floor(pool_detail[0].reserves.token * 10**6));
  const product = sol_reserve * token_reserve;
  let new_sol_reserve = sol_reserve + solAmount;
  let new_token_reserve = product / new_sol_reserve + 1n;
  // console.log(new_token_reserve);
  let amount_to_be_purchased = token_reserve - new_token_reserve;

  return amount_to_be_purchased;
}

export const getPumpSwapPool = async (mint:PublicKey) => {
    const pools = await getPoolsWithBaseMint(mint);
    return pools[0].address;
}
/**
 * Returns the PDA (Program Derived Address) for the pump pool authority.
 * @param baseMint The base mint PublicKey.
 * @returns The PDA PublicKey.
 */
export function pumpPoolAuthorityPDA(baseMint: PublicKey): PublicKey {
  const programId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const [pumpPoolAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool-authority"), baseMint.toBuffer()],
    programId
  );
  return pumpPoolAuthority;
}

export const CANONICAL_POOL_INDEX = 0;

export function globalConfigPda(
  programId: PublicKey = PUMP_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    programId,
  );
}

export function poolPda(
  index: number,
  owner: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey = PUMP_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      new BN(index).toArrayLike(Buffer, "le", 2),
      owner.toBuffer(),
      baseMint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    programId,
  );
}

export function lpMintPda(
  pool: PublicKey,
  programId: PublicKey = PUMP_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_lp_mint"), pool.toBuffer()],
    programId,
  );
}

export function lpMintAta(lpMint: PublicKey, owner: PublicKey) {
  return getAssociatedTokenAddressSync(
    lpMint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
}

export function pumpPoolAuthorityPda(
  mint: PublicKey,
  pumpProgramId: PublicKey = PUMP_PROGRAM_ID_PUBKEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool-authority"), mint.toBuffer()],
    pumpProgramId,
  );
}
export function canonicalPumpPoolPda(
  mint: PublicKey,
  programId: PublicKey = PUMP_AMM_PROGRAM_ID,
  pumpProgramId: PublicKey = PUMP_PROGRAM_ID_PUBKEY,
): [PublicKey, number] {
  const [pumpPoolAuthority] = pumpPoolAuthorityPda(mint, pumpProgramId);

  return poolPda(
    CANONICAL_POOL_INDEX,
    pumpPoolAuthority,
    mint,
    NATIVE_MINT,
    programId,
  );
}

export function pumpAmmEventAuthorityPda(
  programId: PublicKey = PUMP_AMM_PROGRAM_ID,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    programId,
  );
}
/**
 * Returns the PDA for coin_creator_vault_authority.
 * @param coinCreator The pool.coin_creator PublicKey.
 * @param programId The program ID for the PDA (default to your program).
 */
export function getCoinCreatorVaultAuthorityPda(
  coinCreator: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("creator_vault"), // constant seed
      coinCreator.toBuffer(),       // pool.coin_creator
    ],
    programId
  );
}
/**
 * Returns the PDA for coin_creator_vault_ata.
 * @param coinCreatorVaultAuthority The coin_creator_vault_authority PDA.
 * @param quoteTokenProgram The quote token program PublicKey.
 * @param quoteMint The quote mint PublicKey.
 */
export function getCoinCreatorVaultAtaPda(
  coinCreatorVaultAuthority: PublicKey,
  quoteTokenProgram: PublicKey,
  quoteMint: PublicKey
): [PublicKey, number] {
  // The program ID for this PDA (from the IDL)
  const programId = new PublicKey([
    140, 151, 37, 143, 78, 36, 137, 241, 187, 61, 16, 41, 20, 142,
    13, 131, 11, 90, 19, 153, 218, 255, 16, 132, 4, 142, 123, 216,
    219, 233, 248, 89
  ]);

  return PublicKey.findProgramAddressSync(
    [
      coinCreatorVaultAuthority.toBuffer(),
      quoteTokenProgram.toBuffer(),
      quoteMint.toBuffer(),
    ],
    programId
  );
}
async function main(){
    const mint = new PublicKey("MINT_ADDRESS");   
    const pool_detail = await getPoolsWithPrices(mint);
    console.log(pool_detail)
    const coin_creator_vault_authority = getCoinCreatorVaultAuthorityPda(pool_detail[0].poolData.coinCreator, PUMP_AMM_PROGRAM_ID);
    console.log("coin_creator_vault_authority: ", coin_creator_vault_authority[0].toBase58());
    const coin_creator_vault_ata = getCoinCreatorVaultAtaPda(coin_creator_vault_authority[0], TOKEN_PROGRAM_ID, NATIVE_MINT);
    console.log("coin_creator_vault_ata: ", coin_creator_vault_ata[0].toBase58());
}

//main();