using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProvMeet.Models
{
    [Table("prov_medal_tallies")]
    public class MedalTally
    {
        [ForeignKey("Team")]
        public int TeamId { get; set; }

        public string Division { get; set; } = string.Empty;
        
        public int Gold { get; set; } = 0;
        
        public int Silver { get; set; } = 0;
        
        public int Bronze { get; set; } = 0;

        // Navigation property for Entity Framework Core
        public virtual Team? Team { get; set; }
    }
}
