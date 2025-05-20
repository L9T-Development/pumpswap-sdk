# PumpSwap SDK

The **PumpSwap SDK** is a powerful software development kit designed to facilitate interactions with PumpSwap using **Jito**. It provides essential functionality like buying/selling tokens, fetching token prices, and accessing liquidity pools. The SDK is implemented in **TypeScript** and allows seamless integration for developers working with the PumpSwap ecosystem.

## Contact

If you need help or other bot developing, contact here: [Telegram](https://t.me/shiny0103)  |  [Twitter](https://x.com/0xTan1319)

## 📚 Features

- **Buy/Sell Tokens:** Perform token swaps using specific parameters with bundle.

- **Fetch Token Prices:** Retrieve the current price of tokens with a single function.

- **Access PumpSwap Pools:** Fetch pool details for specific tokens.

- **Customizable Environment:** Easily configure private keys and RPC keys.

## Usage

### buy/sell on PumpSwap
```typescript
import {wallet_1} from "./constants";
import {PumpSwapSDK} from './pumpswap';
async function main() {
    const mint = "your-pumpfun-token-address";
    const sol_amt = 0.99; // buy 1 SOL worth of token using WSOL
    const sell_percentage = 0.5; // sell 50% of the token
    const pumpswap_sdk = new PumpSwapSDK();
    await pumpswap_sdk.buy(new PublicKey(mint), wallet_1.publicKey, sol_amt); // 0.99 sol
    await pumpswap_sdk.sell_percentage(new PublicKey(mint), wallet_1.publicKey, sell_percentage);
    await pumpswap_sdk.sell_exactAmount(new PublicKey(mint), wallet_1.publicKey, 1000); // 1000 token
}
```

### Fetch the price
```typescript
import {getPrice} from './pool';
async function main() {
    const mint = new PublicKey("your-pumpfun-token-address");   
    console.log(await getPrice(mint));
}
```

### Fetch the pool
```typescript
import {getPumpSwapPool} from './pool';
async function main() {
    const mint = new PublicKey("your-pumpfun-token-address");   
    console.log(await getPumpSwapPool(mint));
}
```


## Credit: https://github.com/ElmTheDev/pumpswap (the pool.ts is copied from this repo)

