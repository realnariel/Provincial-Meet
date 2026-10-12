namespace ProvMeet.Models;

public record PlayerMedalEntry(int EventId, string EventTitle, string Sport, string SportType,
    string Category, string Division, string Player, string Team, string School, string Medal)
{
    public int MedalOrder => Medal == "Gold" ? 0 : Medal == "Silver" ? 1 : 2;
}

public class PlayerMedalReportViewModel
{
    public bool ShowEvents { get; set; }
    public string? Sport { get; set; }
    public string? SportType { get; set; }
    public string? Category { get; set; }
    public string? Division { get; set; }
    public string? Player { get; set; }
    public string? Team { get; set; }
    public bool ExactPlayer { get; set; }
    public List<PlayerMedalEntry> Entries { get; set; } = new();
    public List<string> Sports { get; set; } = new();
    public List<string> SportTypes { get; set; } = new();
    public List<string> Divisions { get; set; } = new();
    public List<string> Players { get; set; } = new();
}
