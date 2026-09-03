/** A country/region reference - populated in place of a bare `*Id` field
 * (Club.AddressCountry, Manager/Player.Nationality, Competition.Country)
 * only when the server route actually requested it. */
export interface Place {
  _id: string;
  Fullname: string;
  Name: string;
  Code: string;
  Region: string;
  Type: string;
}
