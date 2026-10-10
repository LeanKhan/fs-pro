package abilities

// Manager Orders are the in-match consumables prepared at the Tactical War Room
// (02 §D, "Spells -> Manager Orders"). The War Room inventory (ClubOrders) holds
// a bounded count per order; a match plan draws from it. Like every other
// registry here, this is data: the cost/trigger are content, the effect is
// carried by sim-core's order payload (07 §1a).

// MaxOrderCount is how many copies of one order the War Room may stock.
const MaxOrderCount = 5

// OrderRegion is an attacking-zone rectangle (x 0 own goal -> 1 opponent goal).
type OrderRegion struct {
	X0 float64
	X1 float64
	Y0 float64
	Y1 float64
}

// Order is one War Room entry.
type Order struct {
	ID          string
	Name        string
	Description string
	// Cost is the Fans price per stocked copy.
	Cost int
	// Region, when set, is the zone the order targets.
	Region *OrderRegion
	// Trigger is when the order fires in-engine.
	Trigger TriggerWhen
}

// Orders is the shipped order catalogue, in canonical order.
var Orders = []Order{
	{ID: "overload_flank", Name: "Overload Flank", Description: "Commit an extra runner to one flank.",
		Cost: 300, Trigger: Trailing, Region: &OrderRegion{X0: 0.6, X1: 1, Y0: 0, Y1: 0.4}},
	{ID: "press_trap", Name: "Press Trap", Description: "Spring a coordinated press to win the ball high.",
		Cost: 250, Trigger: Drawing},
	{ID: "switch_play", Name: "Switch Play", Description: "Move the ball to the far side in one pass.",
		Cost: 200, Trigger: Always},
	{ID: "second_wind", Name: "Second Wind", Description: "A late push when the legs are heavy.",
		Cost: 350, Trigger: StaminaBelow},
	{ID: "time_waste", Name: "Time-Waste", Description: "Slow the game down and keep the ball.",
		Cost: 150, Trigger: Leading},
}

// OrderByID resolves a War Room entry.
func OrderByID(id string) (Order, bool) {
	for _, o := range Orders {
		if o.ID == id {
			return o, true
		}
	}
	return Order{}, false
}
