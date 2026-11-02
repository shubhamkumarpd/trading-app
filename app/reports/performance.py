
class TradePerformance:

    def __init__(self, trades):
        self.trades = [
            trade for trade in trades
            if trade.get("status") == "CLOSED"
        ]

    def generate_report(self):
        total = len(self.trades)

        if total == 0:
            return {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0,
                "gross_pnl": 0,
                "net_pnl": 0,
                "profit_factor": 0,
            }

        winners = [
            trade for trade in self.trades
            if float(trade.get("net_pnl", trade.get("pnl", 0))) > 0
        ]

        losers = [
            trade for trade in self.trades
            if float(trade.get("net_pnl", trade.get("pnl", 0))) < 0
        ]

        gross_pnl = sum(
            float(trade.get("gross_pnl", 0))
            for trade in self.trades
        )

        net_pnl = sum(
            float(trade.get("net_pnl", trade.get("pnl", 0)))
            for trade in self.trades
        )

        gross_profit = sum(
            float(trade.get("net_pnl", trade.get("pnl", 0)))
            for trade in winners
        )

        gross_loss = abs(sum(
            float(trade.get("net_pnl", trade.get("pnl", 0)))
            for trade in losers
        ))

        profit_factor = (
            round(gross_profit / gross_loss, 2)
            if gross_loss > 0
            else None
        )

        return {
            "total_trades": total,
            "winning_trades": len(winners),
            "losing_trades": len(losers),
            "win_rate": round(len(winners) / total * 100, 2),
            "gross_pnl": round(gross_pnl, 2),
            "net_pnl": round(net_pnl, 2),
            "profit_factor": profit_factor,
        }
