using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProvMeet.Models
{
    [Table("prov_coordinators")]
    public class Coordinator
    {
        [Key]
        [Column("id")] 
        public int Id { get; set; }

        [Required]
        [StringLength(50)]
        [Column("username")] 
        public string Username { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        [Column("passwordhash")] 
        public string Password { get; set; } = string.Empty; 

        [Required]
        [StringLength(100)]
        [Column("fullname")] 
        public string FullName { get; set; } = string.Empty;

        [Column("is_admin")]
        public bool IsAdmin { get; set; }

        // Helper property to check if user needs to change password on first login
        [NotMapped]
        public bool NeedsPasswordChange => ProvMeet.Security.CoordinatorPasswords.Verify(Password, "coordinator", out _);
    }
}
