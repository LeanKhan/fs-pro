import {Team} from './Team';

/** MatchSide
 * 
 * Represents a team playing in a match.
 * @extends Team 
 */

export class MatchSide extends Team implements Team {
    public AttackingForm: number = 0;
    public DefensiveForm: number = 0;
    public ProbalityNumber: number = 0;
    public ChancesCreatedRate: number = 0;
    public ChancesCreatedNumber: number = 0;
    public GoalsScored: number = 0;
    public StartingSquad: [] = [];
    public Substitutes: [] = [];

    // Class methods
    
    public calculateForm():void{
        this.AttackingForm = Math.round(Math.random() * 11) + 1;
        this.DefensiveForm = Math.round(Math.random() * 11) + 1;
    }

    public calculateCCN():void{
        this.ChancesCreatedNumber = this.AttackingClass * this.ChancesCreatedRate;
    }

    /**
     * Calculate Chances Created Rate 
     * 
     * @param {number} _DC - Defensive Class of other team
     * @param {number} _DF - Defensive Form of other team
     */
    public calculateCCR(_DC:number, _DF:number):void{
        this.ChancesCreatedRate = (this.AttackingClass + this.AttackingForm)/
        (_DC + _DF)
    }
    
    public calculateProbalityNumber(){
        this.ProbalityNumber = Math.round(Math.random() * 11) + 1;
    }

    /** Calculate Goals team scored
     * @param {number} _DF - Defensive Form of other team
     */
    public calculateGoalsScored(_DF:number){
        this.GoalsScored =
        ((this.ProbalityNumber - _DF) / 12) *
          this.ChancesCreatedNumber <
        1
          ? 0
          : Math.round(
              ((this.ProbalityNumber - _DF) / 12) *
                this.ChancesCreatedNumber
            );
    }

}