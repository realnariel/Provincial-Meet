using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProvMeet.Models
{
    [Table("prov_events")]
    public class Event
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }
        
        [Required]
        [Column("title")]
        public string Title { get; set; } = string.Empty;
        
        [Column("sport_name")]
        public string? SportName { get; set; }
        
        [Column("sport_category")]
        public string? SportCategory { get; set; }

        [Column("event_category")]
        public string? EventCategory { get; set; }
        
        [Required]
        [Column("division")]
        public string Division { get; set; } = "Elementary"; 
        
        [Required]
        [Column("status")]
        public string Status { get; set; } = "Pending"; 

        [Column("coordinatorid")]
        public int? CoordinatorId { get; set; }

        [Column("goldteamid")]
        public int? GoldTeamId { get; set; }

        [Column("silverteamid")]
        public int? SilverTeamId { get; set; }

        [Column("bronzeteamid")]
        public int? BronzeTeamId { get; set; }

        [Column("createdat")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("updatedat")]
        public DateTime? UpdatedAt { get; set; } = DateTime.UtcNow;

        [Column("gold_winner_name")]
        public string? GoldWinnerName { get; set; }

        [Column("silver_winner_name")]
        public string? SilverWinnerName { get; set; }

        [Column("bronze_winner_name")]
        public string? BronzeWinnerName { get; set; }

        [Column("last_updated_by")]
        public string? LastUpdatedBy { get; set; }
    }
}
